# GCP Audio Processing Server

Node.js Express server that handles audio upload, transcription, and proximity scoring for the Qualtrics survey pipeline.

## Features

- Audio file upload and storage to Google Cloud Storage
- Real-time speech-to-text transcription using GCP Speech-to-Text API
- Levenshtein distance-based proximity scoring
- RESTful API endpoints for integration with Qualtrics

## Prerequisites

- Node.js 18 or higher
- Google Cloud Platform account with:
  - Cloud Storage API enabled
  - Speech-to-Text API enabled
  - A service account with appropriate permissions
- GCP bucket for audio storage

## Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd <repo-directory>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```
BUCKET_NAME=your-gcp-bucket-name
PORT=8080
NODE_ENV=production
```

### 4. Set up GCP authentication

Place your service account key file in a secure location (do NOT commit it to Git) and set the environment variable:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
```

### 5. Run the server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### POST /upload-audio

Upload and process an audio file.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `audio` (file): Audio file in WebM format
  - `questionId` (string): Identifier for the question
  - `targetWord` (string): Expected answer for proximity scoring

**Response:**
```json
{
  "success": true,
  "url": "https://storage.googleapis.com/...",
  "transcript": "transcribed text",
  "transcription_confidence": 95.5,
  "target_word": "example",
  "proximity_score": 87.5,
  "exact_match": false,
  "levenshtein_similarity": 87.5,
  "filename": "audio/Q1/2024-01-01T12-00-00_abc123.webm",
  "file_size_kb": 45.2
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy"
}
```

### GET /

Service information endpoint.

## Deployment

### Docker

Build the Docker image:
```bash
docker build -t audio-transcription-service .
```

Run the container:
```bash
docker run -p 8080:8080 \
  -e BUCKET_NAME=your-bucket-name \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json \
  -v /path/to/service-account-key.json:/app/credentials.json:ro \
  audio-transcription-service
```

### GCP Cloud Run

1. Build and push to Google Container Registry:
```bash
gcloud builds submit --tag gcr.io/PROJECT-ID/audio-transcription-service
```

2. Deploy to Cloud Run:
```bash
gcloud run deploy audio-transcription-service \
  --image gcr.io/PROJECT-ID/audio-transcription-service \
  --platform managed \
  --region us-central1 \
  --set-env-vars BUCKET_NAME=your-bucket-name \
  --allow-unauthenticated
```

## Security Considerations

- **Never commit credentials**: The `.gitignore` file is configured to exclude all credential files
- **Environment variables**: All sensitive configuration is managed through environment variables
- **Service account permissions**: Use a service account with minimal required permissions
- **CORS**: Configure CORS appropriately for your production environment

## Project Structure

```
.
├── server.js           # Main application file
├── package.json        # Dependencies and scripts
├── Dockerfile         # Docker configuration
├── .env.example       # Example environment variables
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## License

[LICENSE]
