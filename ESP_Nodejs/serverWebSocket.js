// Modules connection
var fs = require("file-system");
const WebSocket = require('ws');
const path = require("path");
const OpenAI = require("openai");

// Variables, objects
const recordFile = path.resolve("./resources/recording.wav");
const voicedFile = path.resolve("./resources/voicedby.wav");
const config = require('./config');
const apiKey = config.apiKey;
const openai = new OpenAI();

const wss_upload = new WebSocket.Server({ port: 8888 });

wss_upload.on('connection', function connection(ws, request) {
	console.log('Client connected');
	const recordingFile = fs.createWriteStream(recordFile);
	
	ws.on('message', async function incoming(data) {
		console.log('Received message from client');

		fs.writeFile(recordFile, message, function (err) {
			if (err) {
			  console.log('Error saving audio file:', err);
			} else {
			  console.log('Audio file saved successfully');
			}
		});
	});

	ws.on('close', () => {
		console.log('WebSocket connection closed');
	});
});
/*
server_download.on("request", (request, response) => {
	const stat = fs.statSync(voicedFile);

	response.writeHead(200, {
		'Content-Type': 'audio/wav',
		'Content-Length': stat.size
	});

	const readStream = fs.createReadStream(voicedFile);
	readStream.pipe(response);
	server_upload.close();
});*/

async function speechToTextAPI() {
	// Imports the Google Cloud client library
	const speech = require("@google-cloud/speech");
	const fs = require("fs");

	// Creates a client
	const client = new speech.SpeechClient();

	// Reads a local audio file and converts it to base64
	const file = fs.readFileSync(fileName);
	const audioBytes = file.toString("base64");

	// The audio file's encoding, sample rate in hertz, and BCP-47 language code
	const audio = {
		content: audioBytes
	};
	const config = {
		encoding: "LINEAR16",
		sampleRateHertz: 16000,
		languageCode: "en-US"
	};
	const request = {
		audio: audio,
		config: config
	};

	// Detects speech in the audio file
	const [response] = await client.recognize(request);
	const transcription = response.results.map((result) => result.alternatives[0].transcript).join("\n");
	console.log(`YOU: ${transcription}`);
	return transcription;
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
	const wav = await openai.audio.speech.create({
		model: "tts-1",
		voice: "echo",
		input: gptResponse,
		response_format: "wav",
	});
	//console.log(voicedFile); //path to saved audio file
	const buffer = Buffer.from(await wav.arrayBuffer());
	await fs.promises.writeFile(voicedFile, buffer);
}

console.log('Upload WebSocket server is running on port 8888');