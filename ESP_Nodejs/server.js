var fs = require("file-system");
const http = require("http");
const server = http.createServer();
const fileName = "./resources/recording.wav";
const axios = require('axios');
const config  = require('./config');
const apiKey = config.apiKey;

server.on("request", (request, response) => {
	if (request.method == "POST" && request.url === "/uploadAudio") {
		var recordingFile = fs.createWriteStream(fileName, { encoding: "utf8" });
		request.on("data", function(data) {
			recordingFile.write(data);
		});

		request.on("end", async function() {
            recordingFile.end();
            const transcription = await speechToTextAPI();
            response.writeHead(200, { "Content-Type": "text/plain" });
            response.end(transcription);

            // Отправка текста на API GPT-3.5 Turbo
            callGPT(transcription);
		});
	} else {
		console.log("Error Check your POST request");
		response.writeHead(405, { "Content-Type": "text/plain" });
	}
});

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
        const response = await axios.post('https://api.openai.com/v1/completions', {
            model: 'gpt-3.5-turbo',
            prompt: text,
            max_tokens: 50,
            temperature: 0.7
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': apiKey 
            }
        });

        console.log('ChatGPT:', response.data.choices[0].text.trim());
    } catch (error) {
        console.error('Error calling GPT:', error.response.data);
    }
}

const port = 8888;
server.listen(port);
console.log(`Listening at ${port}`);