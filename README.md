# Dodge AI - SAP O2C Graph + Chat

This project implements the assignment with:
- Next.js (App Router)
- Cytoscape graph visualization
- Neo4j + Cypher graph storage/query
- OpenRouter API for natural-language query planning and response generation

## Folder assumptions

- App folder: `dodge-ai-app`
- Dataset folder (already present): `../sap-o2c-data` relative to app root

## Setup

1. Copy env file:

```bash
cp .env.example .env.local
```

2. Fill Neo4j and OpenRouter values in `.env.local`.

3. Install dependencies:

```bash
npm install
```

4. Start app:

```bash
npm run dev
```

## Usage

1. Open `http://localhost:3000`.
2. Click **Ingest** to load SAP O2C JSONL data into Neo4j.
3. Explore graph with node click expansion.
4. Ask questions in chat panel, for example:
   - Which products are associated with the highest number of billing documents?
   - Trace the full flow for billing document 90504298.
   - Identify sales orders with broken or incomplete flows.

## API routes

- `POST /api/ingest` - ingest dataset into Neo4j
- `GET /api/graph?focus=<id>` - fetch graph or local neighborhood
- `POST /api/chat` - NL query -> Cypher -> grounded answer
- `GET /api/health` - Neo4j connectivity check

## Guardrails

- Off-topic queries are rejected with a domain-only response.
- Generated Cypher is blocked if it contains write operations.
- Responses are generated from executed query rows only.
