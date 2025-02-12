# Email Draft Generator with AI Integration

This project uses the IMAP protocol to fetch unread emails from a specified folder, parse their content, and generate AI-powered draft responses. It then stores the drafts in the "Drafts" folder of the mailbox.

## Features

- Fetch unread emails from a specified IMAP inbox folder.
- Parse email bodies using the `mailparser` library.
- Generate email drafts using OpenAI's API (`generateText`).
- Append AI-generated drafts to the "Drafts" folder in your IMAP server.
- Handle email formatting (e.g., clean HTML, unicode characters).
- Add custom signature to generated drafts.

## Requirements

- Node.js
- IMAP server credentials
- OpenAI API key (for text generation)
- dotenv library for environment variables

## Installation

1. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root of your project with the following variables. You can use the `.env.example` file as a template.

   ```env
   OPENAI_MODEL=your_openai_model (e.g., gpt-4o)

   IMAP_USER=your_imap_username
   IMAP_PASSWORD=your_imap_password
   IMAP_HOST=your_imap_host (e.g., imap.gmail.com)
   IMAP_PORT=your_imap_port (e.g., 993 for SSL)
   INBOX_FOLDER=your_inbox_folder (leave blank for entire INBOX, use "Folders/Important" for a folder named "Important")
   ```

4. Add the context and signature text files:
   - `prompt.txt` – Contains the AI prompt context. You can copy the content from the `prompt.example.txt` file.
   - `signature.txt` – Contains your signature that will be appended to the generated drafts. You can copy the content from the `signature.example.txt` file.

## Usage

Run the script to start fetching unread emails, generating drafts, and appending them to the "Drafts" folder:

```bash
npm run start
```

### Workflow

1. **IMAP Connection**: Connects to the IMAP server using the credentials from the `.env` file.
2. **Fetch Unseen Emails**: Searches for all unread emails from the last 7 days in the specified folder.
3. **Parse Email Content**: Uses the `mailparser` library to parse email bodies (HTML or plain text).
4. **Generate AI Draft**: Sends the parsed email body to OpenAI's API to generate a draft response.
5. **Append Draft**: Saves the generated draft to the "Drafts" folder in the mailbox.

## Notes

- The script doesn't mark emails as "seen" and won't change the state of the original emails.
- By default, it fetches emails from the last 7 days. You can adjust this in the `searchCriteria` variable.
- Ensure you have sufficient permissions to append messages to the "Drafts" folder.
