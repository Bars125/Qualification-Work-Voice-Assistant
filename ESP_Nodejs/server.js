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
app.get('/downloadAudio', (req, res) => {
	//const filePath = path.join(__dirname, 'audio', 'audiofile.wav'); // Укажите путь к вашему аудиофайлу

	const stat = fs.statSync(speechFile);
	const fileSize = stat.size;
	const range = req.headers.range;

	if (range) {
		console.log("RANGE!");
		const parts = range.replace(/bytes=/, "").split("-");
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

		if (start >= fileSize) {
			res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
			return;
		}

		const chunksize = (end - start) + 1;
		const file = fs.createReadStream(speechFile, { start, end });
		const head = {
			'Content-Range': `bytes ${start}-${end}/${fileSize}`,
			'Accept-Ranges': 'bytes',
			'Content-Length': chunksize,
			'Content-Type': 'audio/wav',
		};

		res.writeHead(206, head);
		file.pipe(res);

		// Закрываем соединение после отправки файла
		file.on('close', () => {
			res.end();
		});
	} else {
		console.log("NOT RANGE!");
		const head = {
			'Content-Length': fileSize,
			'Content-Type': 'audio/wav',
		};
		res.writeHead(200, head);
		const fileStream = fs.createReadStream(speechFile);

		fileStream.pipe(res);

		// Закрываем соединение после отправки файла
		fileStream.on('end', () => {
			res.end();
		});

		fileStream.on('error', (err) => {
			console.error('Error reading file:', err);
			res.status(500).end();
		});
	}
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