Voice Assistant. ESP32 takes data from INMP441 through I2S, save the data to SPIFFS FS, send data through HTTP to NodeJS server through Streams, wait for the response.
The NodeJS Server monitors input request, when there is, save data to the specified directory on the PC, then it run through 3 OpenAI API's to get Voiced response from AI. Sent it back to the ESP, the file is directed straight to the speaker, without saving to Spiffs. Then ESP32 fall into sleep. The cycle is over.

Some ESP32 C++ code was taken from That Project guy. Really appreciate it.

URL: https://www.youtube.com/watch?v=qmruNKeIN-o
