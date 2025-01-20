Voice Assistant. ESP32 takes data from INMP441 through I2S, saves the data to SPIFFS FS, sends data through HTTP to NodeJS server through Streams, waits for the response.
The NodeJS Server monitors input request, when there is, saves the data to the specified directory on the PC, then it runs data through 3 OpenAI API's to get Voiced response from AI. Sends it back to the ESP, the file is directed straight to the speaker, without saving to Spiffs. Then ESP32 falls into the Deep sleep. The cycle is over.

Some ESP32 C++ code was taken from That Project guy. Really appreciate it.

URL: https://www.youtube.com/watch?v=qmruNKeIN-o

IMPORTANT DETAILS TO MAKE THE PROJECT WORK

1. The API-key is stored in the "config.js" file:
// config.js
const apiKey = 'Bearer XXX';
module.exports = {
    apiKey: apiKey
};

2. You have to create a User Variable "OPENAI_API_KEY" with value "your API-key"
![Screenshot 2025-01-19 180216](https://github.com/user-attachments/assets/99a7e414-6986-4254-96d2-beb1cf2794d8)

3. The "config.h" file contains only SSID and PASS (ESP32 side)
#ifndef NETWORK_PARAM_H
#define NETWORK_PARAM_H

#define WIFI_SSID       "Vodafone"
#define WIFI_PASSWORD   "Pass"

#endif // NETWORK_PARAM_H
