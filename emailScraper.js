const Imap = require("imap");
const { simpleParser } = require("mailparser");
const fs = require("fs");
require("dotenv").config();

// Email configuration
const imapConfig = {
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASS,
  host: process.env.IMAP_HOST,
  port: 993,
  tls: true,
  tlsOptions: {
    rejectUnauthorized: false, // Allow self-signed certificates
  },
};

// Filter criteria
const validSenders = ["ICICI", "HSBC", "HDFC"];
const subjectFilter = /current account statement/i; // Regex for subject
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

const downloadAttachment = (attachment, outputPath) => {
  const fileStream = fs.createWriteStream(outputPath);
  fileStream.write(attachment.content);
  fileStream.end();
  console.log(`Attachment saved: ${outputPath}`);
};

const fetchEmails = () => {
  const imap = new Imap(imapConfig);

  imap.once("ready", () => {
    imap.openBox("INBOX", false, (err, box) => {
      if (err) throw err;

      // Search criteria
      const searchCriteria = [
        "ALL",
        ["SINCE", oneYearAgo.toISOString()],
        ["HEADER", "SUBJECT", "current account statement"],
      ];

      imap.search(searchCriteria, (err, results) => {
        if (err) throw err;

        if (!results || results.length === 0) {
          console.log("No emails found matching the criteria.");
          imap.end();
          return;
        }

        const fetch = imap.fetch(results, { bodies: "", struct: true });

        fetch.on("message", (msg) => {
          msg.on("body", (stream) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) throw err;

              const { subject, from, attachments } = parsed;
              const sender = from.value[0].name || from.value[0].address;

              // Check sender and subject
              if (
                validSenders.some((bank) => sender.includes(bank)) &&
                subjectFilter.test(subject)
              ) {
                console.log(`Matched Email: ${subject} from ${sender}`);

                // Save attachments
                if (attachments.length > 0) {
                  attachments.forEach((attachment) => {
                    const outputPath = `./attachments/${attachment.filename}`;
                    downloadAttachment(attachment, outputPath);
                  });
                }
              }
            });
          });
        });

        fetch.once("error", (err) => {
          console.error("Fetch error:", err);
        });

        fetch.once("end", () => {
          console.log("Done fetching emails.");
          imap.end();
        });
      });
    });
  });

  imap.once("error", (err) => {
    console.error("IMAP error:", err);
  });

  imap.once("end", () => {
    console.log("Connection closed.");
  });

  imap.connect();
};

fetchEmails();
