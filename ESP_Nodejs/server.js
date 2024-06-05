// include libs
const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('./config');

// Init express
const app = express();
const port = 3000;

// Path to files
const recordFile = path.resolve("./resources/recording.wav");
const voicedFile = path.resolve("./resources/voicedby.wav");

// API Key
const apiKey = config.apiKey;
let shouldDownloadFile = false;
const maxTokens = 30; 			// defines the length of GPT response

// Init OpenAI
const openai = new OpenAI();

// Middleware for data processing in a "multipart/form-data" format 
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Handler for loading an audio file
app.post('/uploadAudio', (req, res) => {
	shouldDownloadFile = false;
	var recordingFile = fs.createWriteStream(recordFile, { encoding: "utf8" });

	req.on('data', function (data) {
		recordingFile.write(data);
	});

	req.on('end', async function () {
		recordingFile.end();
		const transcription = await speechToTextAPI();
		res.status(200).send(transcription);
		// Отправка транскрипции в API GPT-3.5 Turbo
		callGPT(transcription);
	});
});

// Handler for checking the value of a variable
app.get('/checkVariable', (req, res) => {
	res.json({ ready: shouldDownloadFile });
});

// File upload handler
app.get('/broadcastAudio', (req, res) => {

	fs.stat(voicedFile, (err, stats) => {
		if (err) {
			console.error('File not found');
			res.sendStatus(404);
			return;
		}

		res.writeHead(200, {
			'Content-Type': 'audio/wav',
			'Content-Length': stats.size
		});

		const readStream = fs.createReadStream(voicedFile);
		readStream.pipe(res);

		readStream.on('end', () => {
			//console.log('File has been sent successfully');
		});

		readStream.on('error', (err) => {
			console.error('Error reading file', err);
			res.sendStatus(500);
		});
	});
});

// Starting the server
app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}/`);
});

async function speechToTextAPI() {
	try {
		const transcription = await openai.audio.transcriptions.create({
			file: fs.createReadStream(recordFile),
			model: "whisper-1",
			response_format: "text"
		});

		console.log('');
		console.log('YOU:', transcription);
		return transcription;
	} catch (error) {
		console.error('Error in speechToTextAPI:', error.message);
		return null;
	}
}

async function callGPT(text) {
	try {
		// Requet message
		const message = {
			role: "system",
			content: text
		};

		// API-request
		const completion = await openai.chat.completions.create({
			messages: [message],
			model: "gpt-3.5-turbo",
			max_tokens: maxTokens 
		}, {
			headers: {
				'Content-Type': 'application/json',
				'Authorization': apiKey
			}
		});

		const gptResponse = completion.choices[0].message.content;
		console.log('ChatGPT:', gptResponse);

		// test to speech function
		GptResponsetoSpeech(gptResponse);

	} catch (error) {
		console.error('Error calling GPT:', error.response.data);
	}
}

async function GptResponsetoSpeech(gptResponse) {
	try {
		const wav = await openai.audio.speech.create({
			model: "tts-1",
			voice: "echo",
			input: gptResponse,
			response_format: "wav",
		});

		const buffer = Buffer.from(await wav.arrayBuffer());
		await fs.promises.writeFile(voicedFile, buffer);

		//console.log("Audio file is successfully saved:", voicedFile);
		shouldDownloadFile = true;
	} catch (error) {
		console.error("Error saving audio file:", error);
	}
}