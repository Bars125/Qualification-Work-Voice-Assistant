const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('./config');
const multer = require('multer');

// Инициализация express
const app = express();
const port = 3000;

// Пути к файлам
const recordingFile = path.resolve("./resources/recording.wav");
const voicedFile = path.resolve("./resources/voicedby.wav");

// API ключ
const apiKey = config.apiKey;
let shouldDownloadFile = false;

// Инициализация OpenAI
const openai = new OpenAI();

// Middleware для обработки данных в формате multipart/form-data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Конфигурация Multer для сохранения файла по указанному пути
// const storage = multer.diskStorage({
// 	destination: (req, file, cb) => {
// 		cb(null, path.dirname(recordingFile)); // Папка, где будет сохраняться файл
// 		console.log('RECORDDIRECTORY' + path.basename(recordingFile));
// 	},
// 	filename: (req, file, cb) => {
// 		cb(null, path.basename(recordingFile)); // Фиксированное имя файла
// 		console.log('RECORDFILENAME' + path.basename(recordingFile));
// 	}
// });

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
	  cb(null, 'resources/');
	},
	filename: (req, file, cb) => {
	  cb(null, 'recording.wav'); // Сохранение с фиксированным именем
	}
  });

const upload = multer({ storage: storage });

// Обработчик для загрузки аудио файла
app.post('/uploadAudio', upload.single('recording'), (req, res) => {
	console.log('File received:', req.file);
	res.send('File uploaded successfully!');

	req.on('end', async function () {
		try {
			const transcription = await speechToTextAPI();
			res.status(200).send(transcription);
			await callGPT(transcription);
		} catch (error) {
			console.error("Error during processing:", error);
			res.status(500).send("Error during processing");
		}
	});
});

// Обработчик для проверки значения переменной
app.get('/checkVariable', (req, res) => {
	res.json({ ready: shouldDownloadFile });
});

// Обработчик для загрузки файла
app.get('/broadcastAudio', (req, res) => {
	//const filePath = path.join(__dirname, 'your_audio_file.wav');

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
	const transcription = await openai.audio.transcriptions.create({
		file: fs.createReadStream(recordingFile),
		model: "whisper-1",
	});

	console.log(`YOU: ${transcription.text}`);
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