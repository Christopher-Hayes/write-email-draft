import Imap from "imap";
import { simpleParser } from "mailparser"; // For parsing email body
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import fs from "fs";

// Load environment variables
import dotenv from "dotenv";
dotenv.config();

const imap = new Imap({
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASSWORD,
  host: process.env.IMAP_HOST ?? "127.0.0.1",
  port: process.env.IMAP_PORT ?? 1143,
  tls: false,
  tlsOptions: { rejectUnauthorized: false },
});

const PROMPT_CONTEXT = fs.readFileSync("prompt.txt", "utf-8");
const SIGNATURE = fs.readFileSync("signature.txt", "utf-8");

imap.once("ready", () => {
  // List all mailboxes
  // imap.getBoxes((err, boxes) => {
  //     if (err) {
  //         console.log('Error listing mailboxes: ', err);
  //     } else {
  //         console.log('Available mailboxes:');
  //         console.log(boxes);
  //     }
  // });
  imap.openBox("INBOX", false, (err, box) => {
    if (err) throw err;

    // Searching for messages in the folder
    imap.openBox(process.env.INBOX_FOLDER, false, (err, box) => {
      if (err) throw err;

      // Search for all unseen emails in the folder from the past 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      imap.search(["UNSEEN", ["SINCE", sevenDaysAgo]], (err, results) => {
        if (err) throw err;

        const fetchOptions = {
          bodies: "", // Fetch the entire email body
        };

        try {
          const f = imap.fetch(results, fetchOptions);
          f.on("message", (msg, seqno) => {
            msg.on("body", (stream, info) => {
              let buffer = "";
              stream.on("data", (chunk) => {
                buffer += chunk.toString();
              });

              stream.once("end", async () => {
                try {
                  // Parse the email body
                  const parsed = await simpleParser(buffer);

                  // Debug
                  // fs.writeFileSync(
                  //   "email.json",
                  //   JSON.stringify(parsed, null, 2)
                  // );

                  // If the email body is encoded (HTML or text), parse and clean it up
                  let emailBody = parsed.html ?? parsed.text;

                  // If the email body is still empty, log an error
                  if (!emailBody) {
                    console.error("No body found in the email");
                    return;
                  }

                  // Generate draft using OpenAI API
                  const draft = await generateDraft(emailBody);

                  const recipient = parsed.from?.text ?? "";
                  const subject = parsed.subject ?? "";
                  const messageId = parsed.messageId ?? "";
                  const references = parsed.references ?? "";
                  const sender = parsed.to?.text ?? "";

                  // Append draft to the "Drafts" folder
                  appendDraftToFolder(
                    draft,
                    recipient,
                    subject,
                    messageId,
                    references,
                    sender
                  );
                } catch (err) {
                  console.error("Error parsing email:", err);
                }
              });
            });

            msg.once("attributes", (attrs) => {
              // const { uid } = attrs;
              // Add a flag to indicate a draft has been created
              // Do not mark as seen, since the user has not seen it yet
              // imap.addFlags(uid, "\\ai-draft", (err) => {
              //   if (err) console.error("Error adding flags:", err);
              // });
            });
          });

          f.once("error", (err) => {
            console.error("Fetch error:", err);
          });

          f.once("end", () => {
            console.log("Done fetching all messages!");
            // TODO: Run this after all messages have been processed
            // imap.end();
          });
        } catch (err) {
          switch (err.code) {
            case "NO":
              console.error("No messages found");
              break;
            case "BAD":
              console.error("Invalid search criteria");
              break;
            default: {
              if (err.message.includes("Nothing to fetch")) {
                console.error("No messages to fetch");
              } else {
                console.error("Error fetching messages:", err);
              }
            }
          }

          imap.end();
        }
      });
    });
  });
});

imap.once("error", (err) => {
  console.log("IMAP Error: ", err);
});

imap.once("end", () => {
  console.log("Connection ended");
});

imap.connect();

// Function to generate the email draft using OpenAI
const generateDraft = async (emailBody) => {
  const response = await generateText({
    model: openai(process.env.OPENAI_MODEL),
    prompt: `
Context:

${PROMPT_CONTEXT}

###

Email:

${emailBody}`,
  });

  return `${response.text ?? ""}

${SIGNATURE}

${
  emailBody
  .replaceAll(/<[^>]+>/g, "")
  // Replace all unicode characters in one go (ie &#8217;)
  .replaceAll(/&#\d+;/g, "")
  // replace html codes like &nbsp;
  .replaceAll(/&\w+;/g, "")
  // Replace all VML tags
  .replaceAll(/v\:\* \{behavior:url\(#default#VML\);\}/g, "")
  .trim()
  .split("\n")
  .map((line) => `> ${line}`)
  .join("\n")}
`;
};

// Function to append the draft to the "Drafts" folder
function appendDraftToFolder(
  draftText,
  recipient,
  subject,
  messageId,
  references,
  sender
) {
  const message = [
    `From: ${sender}`,
    `To: ${recipient}`,
    `Subject: RE: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${references}`,
    "",
    draftText,
  ].join("\r\n");

  // log the reply message to the file
  fs.writeFileSync("reply.txt", message);

  imap.append(message, { mailbox: "Drafts" }, (err) => {
    if (err) {
      console.log("Error appending draft: ", err);
    } else {
      console.log('Draft appended to "Drafts" folder');

      setTimeout(() => {
        // Now add the ai-draft label after appending the message

        imap.openBox("Drafts", false, (err, box) => {
          imap.search(
            [
              ["TO", recipient],
              ["SUBJECT", `RE: ${subject}`],
            ],
            (err, results) => {
              if (err) {
                console.error("Error searching for draft:", err);
                return;
              }

              if (results.length === 0) {
                console.error("No drafts found with the specified subject");
                return;
              }

              // Sort results in reverse order (newest first)
              results.sort((a, b) => b - a); // assuming the results are UIDs or numbers

              // Assuming the search finds the correct draft
              console.log("Drafts found:", results);
              const draftUid = results[0]; // Use the first draft found, assuming it's the right one
              console.log("Draft UID:", draftUid);
              // imap.addFlags(draftUid, "\\ai-draft", (err) => {
              //   if (err) {
              //     console.error("Error adding ai-draft flag:", err);
              //   } else {
              //     console.log("ai-draft label added successfully!");
              //   }
              // });
              // imap.store(draftUid, "+FLAGS", "\\ai-draft", (err) => {
              //   if (err) {
              //     console.error("Error adding ai-draft label:", err);
              //   } else {
              //     console.log("ai-draft label added successfully!");
              //   }
              // });

              // TODO - maybe use this?
// imap.addFlags(draftUid, "\\Flagged", (err) => {
//   if (err) {
//     console.error("Error adding Flagged flag:", err);
//   } else {
//     console.log("Flagged flag added successfully!");
//   }
// });

imap.addFlags(draftUid, '\\ai-draft', (err) => {
  if (err) {
    console.error("Error adding ai-draft label:", err);
  } else {
    console.log("ai-draft label added successfully!");
  }
});



              // Link the draft to the original email
              // imap.addFlags(draftUid, "\\Draft", (err) => {
              //   if (err) {
              //     console.error("Error adding Draft flag:", err);
              //   } else {
              //     console.log("Draft label added successfully!");
              //   }
              // });

              // debug
// imap.close(() => {
//   imap.status('Drafts', (err, status) => {
//     if (err) {
//       console.error("Error fetching status of Drafts folder:", err);
//     } else {
//       console.log("Drafts folder status:", status);
//       console.log("Available flags in Drafts folder:", status.flags);
//     }
//   });
// });
            }
          );
        });
      }, 1000);
    }
  });
}
