var fs = require("file-system");
const http = require("http");
const server = http.createServer();
const fileName = "./resources/recording.wav";
const config  = require('./config');
const apiKey = config.apiKey;

//import OpenAI from "openai"; -> const OpenAI = require("openai")
const OpenAI = require("openai")
const openai = new OpenAI();

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

		console.log('ChatGPT:', completion.choices[0].message.content);

    } catch (error) {
        console.error('Error calling GPT:', error.response.data);
    }
}

const port = 8888;
server.listen(port);
console.log(`Listening at ${port}`);