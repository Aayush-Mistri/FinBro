# FinBro 🪙
**FinSight** is a personal finance intelligence backend application designed to analyze personal UPI financial transactions directly from bank statement PDFs. Built entirely on top of local services (SQLite, memory-based PDF parsing, and free-tier LLM integrations with Gemini and Groq fallback).

---

## Features
1. **PDF Parsing (In-Memory)**: Upload bank statements; they are parsed strictly in memory (never written to disk).
2. **LLM Ingestion (Gemini + Groq Fallback)**: Extracts all transactions from raw, messy text using Gemini 2.0 Flash, with a seamless, robust fallback to Groq (`llama-3.1-8b-instant`) if quota/rate limits are hit.
3. **VPA Enrichment**: Classifies VPAs as personal or merchant, cleans names, and queries Truecaller for phone numbers.
4. **Intelligent Deduplication**: Skips duplicate transactions within a 60-second window to support overlapping upload periods.
5. **Batch Categorization**: Categorizes transactions in batches of up to 50 using a custom schema (Food, Transport, Shopping, Bills, etc.).
6. **Insight Cron Engine**: Runs every Monday at 9:00 AM, analyzing spending trends and emailing insights.
7. **Conversational Assistant**: Chat endpoint translates queries to SQL filters and feeds context back to the LLM to answer questions.

---

## Prerequisites
- **Node.js**: 18+ (tested on Node v20/v22)
- **SMTP Server**: A Gmail account to dispatch weekly insights.

---

## Installation & Setup

1. **Clone & Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```
   - **GEMINI_API_KEY**: Get a free API key from [Google AI Studio](https://aistudio.google.com/).
   - **GROQ_API_KEY**: Get a free API key from [Groq Console](https://console.groq.com/).
   - **JWT_SECRET**: Any strong secret string.
   - **EMAIL_USER / EMAIL_PASS**: Gmail app password. Setup by visiting: Google Account Settings → Security → 2-Step Verification → App Passwords.

3. **Truecaller CLI Authentication (Optional Fallback)**:
   For resolving phone numbers, log in to Truecaller on your host:
   ```bash
   npx truecallerjs login
   ```
   *Note: If not logged in, lookups fail gracefully without crashing the statement upload.*

---

## Running the Application

- **Start API Server**:
  ```bash
  node index.js
  ```
  The server will initialize the SQLite database at `data/finsight.db` and start listening on port `3000`.

- **Run CLI Integration Test**:
  You can verify the statement extraction and parsing pipeline against a local PDF file:
  ```bash
  node test/pdfTest.js ./path/to/statement.pdf
  ```
  This creates a mock user (ID 1) in SQLite and runs the extraction, VPA enrichment, batch categorization, and pattern detection logic.

---

## API Endpoints

### 1. Authentication
* **Register a User**:
  ```bash
  curl -X POST http://localhost:3000/auth/register \
    -H "Content-Type: application/json" \
    -d '{"name": "Aayush", "email": "aayush@example.com", "password": "securepassword123"}'
  ```

* **Login**:
  ```bash
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "aayush@example.com", "password": "securepassword123"}'
  ```
  *Use the returned JWT token to authorize subsequent requests.*

### 2. Transaction Management
* **Upload Bank Statement PDF**:
  ```bash
  curl -X POST http://localhost:3000/transactions/upload \
    -H "Authorization: Bearer <your_jwt_token>" \
    -F "file=@/path/to/statement.pdf"
  ```

### 3. Analytics & Dashboard
* **Get Dashboard Stats & LLM Insights**:
  ```bash
  curl -X GET http://localhost:3000/dashboard \
    -H "Authorization: Bearer <your_jwt_token>"
  ```

### 4. Interactive Chat
* **Ask Questions about your Finances**:
  ```bash
  curl -X POST http://localhost:3000/chat \
    -H "Authorization: Bearer <your_jwt_token>" \
    -H "Content-Type: application/json" \
    -d '{"message": "How much did I spend on food this week?"}'
  ```

### 5. Custom VPA Labels (Shortcuts)
* **Create/Update a VPA Label**:
  ```bash
  curl -X POST http://localhost:3000/labels \
    -H "Authorization: Bearer <your_jwt_token>" \
    -H "Content-Type: application/json" \
    -d '{"vpa": "friend@okaxis", "label": "Rahul", "category": "Peer Transfer"}'
  ```

* **Get All Labels**:
  ```bash
  curl -X GET http://localhost:3000/labels \
    -H "Authorization: Bearer <your_jwt_token>"
  ```

* **Delete a Label**:
  ```bash
  curl -X DELETE http://localhost:3000/labels/friend@okaxis \
    -H "Authorization: Bearer <your_jwt_token>"
  ```

---

## Project Structure
```
/finsight
  /src
    /db            → db.js (SQLite connection + table initialization)
    /models        → user.js, transaction.js, vpaLabel.js
    /routes        → auth.js, transactions.js, dashboard.js, chat.js, labels.js
    /controllers   → business logic for auth, transactions, dashboard, chat, labels
    /services      → pdfParser.js, vpaEnricher.js, geminiService.js, insightJob.js
    /utils         → upiHandleClassifier.js, deduplicator.js
    /middleware    → auth.js (JWT authentication)
  /data            → finsight.db (auto-created SQLite DB)
  /test            → pdfTest.js, testLLM.js
  index.js
  .env.example
  README.md
```
