const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('./config');

// Инициализация express
const app = express();
const port = 3000;

// Пути к файлам
const fileName = path.resolve("./resources/recording.wav");
const speechFile = path.resolve("./resources/voicedby.wav");

// API ключ
const apiKey = config.apiKey;
let shouldDownloadFile = false;

// Инициализация OpenAI
const openai = new OpenAI();

// Middleware для обработки данных в формате multipart/form-data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Обработчик для загрузки аудио файла
app.post('/uploadAudio', (req, res) => {
	var recordingFile = fs.createWriteStream(fileName, { encoding: "utf8" });

	req.on("data", function (data) {
		recordingFile.write(data);
	});

	req.on("end", async function () {
		recordingFile.end();
		const transcription = await speechToTextAPI();
		res.status(200).send(transcription);
		// Отправка транскрипции в API GPT-3.5 Turbo
		callGPT(transcription);
	});
});

// Обработчик для проверки значения переменной
app.get('/checkVariable', (req, res) => {
	res.send(shouldDownloadFile ? "true" : "false");
});

// Обработчик для загрузки файла
app.get('/broadcastAudio', (req, res) => {
	//const filePath = path.join(__dirname, 'your_audio_file.wav');

	fs.stat(speechFile, (err, stats) => {
		if (err) {
			console.error('File not found');
			res.sendStatus(404);
			return;
		}

		res.writeHead(200, {
			'Content-Type': 'audio/wav',
			'Content-Length': stats.size
		});

		const readStream = fs.createReadStream(speechFile);
		readStream.pipe(res);
		
		readStream.on('end', () => {
			console.log('File has been sent successfully');
		});

		readStream.on('error', (err) => {
			console.error('Error reading file', err);
			res.sendStatus(500);
		});
	});
});

// Запуск сервера
app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}/`);
});

async function speechToTextAPI() {
	// Imports the Google Cloud client library
	const speech = require("@google-cloud/speech");

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
			max_tokens: 25
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
	//console.log(speechFile); //path to saved audio file
	const buffer = Buffer.from(await wav.arrayBuffer());
	await fs.promises.writeFile(speechFile, buffer);
	console.log("Audiofile is successfully saved:", speechFile);
	shouldDownloadFile = true;
}