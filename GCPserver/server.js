const express = require('express');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const speech = require('@google-cloud/speech');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Enable CORS for Qualtrics
app.use(cors());
app.use(express.json());

// Initialize Google Cloud clients
const storage = new Storage();
const speechClient = new speech.SpeechClient();

// IMPORTANT: Set this environment variable in your deployment
const BUCKET_NAME = process.env.BUCKET_NAME;

if (!BUCKET_NAME) {
    console.error('ERROR: BUCKET_NAME environment variable is not set');
    process.exit(1);
}

/**
 * Calculate proximity score between transcript and target word
 */
function calculateProximityScore(transcript, targetWord) {
    if (!transcript || !targetWord) {
        return {
            final_score: 0,
            exact_match: false,
            levenshtein_similarity: 0
        };
    }

    const transcriptLower = transcript.toLowerCase().trim();
    const targetLower = targetWord.toLowerCase().trim();

    // Exact match: transcript must exactly equal target (case-insensitive)
    const exactMatch = transcriptLower === targetLower;

    // Calculate Levenshtein distance - comparing whole transcript to target
    const levDistance = levenshteinDistance(transcriptLower, targetLower);
    const maxLen = Math.max(transcriptLower.length, targetLower.length);
    const levScore = maxLen > 0 ? (1 - levDistance / maxLen) * 100 : 0;

    // Final score is just the Levenshtein score
    const finalScore = levScore;

    return {
        final_score: Math.round(finalScore * 100) / 100,
        exact_match: exactMatch,
        levenshtein_similarity: Math.round(levScore * 100) / 100
    };
}

/**
 * Calculate sequence similarity (similar to Python's SequenceMatcher)
 */
function sequenceSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}

/**
 * Transcribe audio using Google Speech-to-Text
 */
async function transcribeAudio(audioBuffer) {
    const audio = {
        content: audioBuffer.toString('base64')
    };

    const config = {
        encoding: 'WEBM_OPUS',
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        model: 'default',
        useEnhanced: true
    };

    const request = {
        audio: audio,
        config: config
    };

    try {
        const [response] = await speechClient.recognize(request);
        
        if (response.results && response.results.length > 0) {
            const transcription = response.results[0].alternatives[0];
            return {
                transcript: transcription.transcript || '',
                confidence: transcription.confidence || 0
            };
        }
        
        return { transcript: '', confidence: 0 };
    } catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
}

/**
 * Upload audio file to Google Cloud Storage
 */
async function uploadToGCS(buffer, filename) {
    const bucket = storage.bucket(BUCKET_NAME);
    const blob = bucket.file(filename);

    await blob.save(buffer, {
        contentType: 'audio/webm',
        metadata: {
            cacheControl: 'public, max-age=31536000'
        }
    });

    // Make the file publicly accessible
    await blob.makePublic();

    return `https://storage.googleapis.com/${BUCKET_NAME}/${filename}`;
}

/**
 * Main upload endpoint
 */
app.post('/upload-audio', upload.single('audio'), async (req, res) => {
    try {
        // Validate request
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }

        const questionId = req.body.questionId || 'unknown';
        const targetWord = req.body.targetWord || '';

        if (!targetWord) {
            return res.status(400).json({
                success: false,
                error: 'No target word provided'
            });
        }

        const audioBuffer = req.file.buffer;

        // Generate unique filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomId = Math.random().toString(36).substring(2, 10);
        const filename = `audio/${questionId}/${timestamp}_${randomId}.webm`;

        console.log(`Processing audio for question ${questionId}...`);

        // Upload to Google Cloud Storage
        const audioUrl = await uploadToGCS(audioBuffer, filename);
        console.log(`✓ Uploaded to GCS: ${audioUrl}`);

        // Transcribe audio
        const { transcript, confidence } = await transcribeAudio(audioBuffer);
        console.log(`✓ Transcribed: "${transcript}"`);

        // Calculate proximity score
        const proximityResults = calculateProximityScore(transcript, targetWord);
        console.log(`✓ Proximity score: ${proximityResults.final_score}%`);

        // Prepare response
        const response = {
            success: true,
            url: audioUrl,
            transcript: transcript,
            transcription_confidence: Math.round(confidence * 100 * 100) / 100,
            target_word: targetWord,
            proximity_score: proximityResults.final_score,
            exact_match: proximityResults.exact_match,
            levenshtein_similarity: proximityResults.levenshtein_similarity,
            filename: filename,
            file_size_kb: Math.round(audioBuffer.length / 1024 * 100) / 100
        };

        console.log(`✓ Request completed successfully`);
        res.json(response);

    } catch (error) {
        console.error('Error processing audio:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
    res.json({
        service: 'Audio Transcription & Proximity Service',
        version: '1.0',
        endpoints: {
            '/upload-audio': 'POST - Upload and process audio',
            '/health': 'GET - Health check'
        }
    });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Using GCP bucket: ${BUCKET_NAME}`);
});
