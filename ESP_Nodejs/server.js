//Variables
var fs = require("file-system");
const http = require("http");
const server_upload = http.createServer();
const server_download = http.createServer();
const fileName = "./resources/recording.wav";
const config  = require('./config');
const apiKey = config.apiKey;

//OpenAi 
const OpenAI = require("openai");
const openai = new OpenAI();
const path = require("path")
const speechFile = path.resolve("./resources/voicedby.wav");

server_upload.on("request", (request, response) => {
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
            // Sending transcripted text to API GPT-3.5 Turbo
            callGPT(transcription);
		});
	} else {
		console.log("Error Check your POST request");
		response.writeHead(405, { "Content-Type": "text/plain" });
	}
});

server_download.on("request", (request, response) => {
    const filePath = 'resources/voicedby.wav';
    const stat = fs.statSync(filePath);

    response.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': stat.size
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(response);
	server_upload.close();
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

		const gptResponse = completion.choices[0].message.content;
		console.log('ChatGPT:', gptResponse);

		// test to speech function
		GptResponsetoSpeech(gptResponse); 

    } catch (error) {
        console.error('Error calling GPT:', error.response.data);
    }
}

async function GptResponsetoSpeech(gptResponse){
	const mp3 = await openai.audio.speech.create({
		model: "tts-1",
		voice: "echo",
		input: gptResponse,
	  });
	  //console.log(speechFile); //path to saved audio file
	  const buffer = Buffer.from(await mp3.arrayBuffer());
	  await fs.promises.writeFile(speechFile, buffer);
}

server_upload.listen(8888, () => {
    console.log('Upload Server is listening on port 8888');
});

server_download.listen(8899, () => {
    console.log('Download Server is listening on port 8899');
});