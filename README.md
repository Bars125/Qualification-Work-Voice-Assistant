Voice Assistant. ESP32 takes data from INMP441 through I2S, saves the data to SPIFFS FS, sends data through HTTP to NodeJS server through Streams, waits for the response.
The NodeJS Server monitors input request, when there is, saves the data to the specified directory on the PC, then it runs data through 3 OpenAI API's to get Voiced response from AI. Sends it back to the ESP, the file is directed straight to the speaker, without saving to Spiffs. Then ESP32 falls into the Deep sleep. The cycle is over.

Some ESP32 C++ code was taken from That Project guy. Really appreciate it.

URL: https://www.youtube.com/watch?v=qmruNKeIN-o
