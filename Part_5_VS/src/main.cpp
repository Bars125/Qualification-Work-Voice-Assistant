// Libraries
#include <driver/i2s.h>
#include <SPIFFS.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "config.h"

// RTOS Ticks Delay
#define TickDelay(ms) vTaskDelay(pdMS_TO_TICKS(ms))

// INMP441 Ports
#define I2S_WS 15
#define I2S_SD 4
#define I2S_SCK 2

// MAX98357A Ports
#define I2S_DOUT 26
#define I2S_BCLK 27
#define I2S_LRC 14

// Wake-up Button
#define Button_Pin GPIO_NUM_33

// LED Ports
#define isWifiConnectedPin 25
#define isAudioRecording 32

// MAX98357A I2S Setup
#define MAX_I2S_NUM I2S_NUM_1
#define MAX_I2S_SAMPLE_RATE (12000)
#define MAX_I2S_SAMPLE_BITS (16)
#define MAX_I2S_READ_LEN (256)

// INMP441 I2S Setup
#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE (16000)
#define I2S_SAMPLE_BITS (16)
#define I2S_READ_LEN (16 * 1024)
#define RECORD_TIME (5) // Seconds
#define I2S_CHANNEL_NUM (1)
#define FLASH_RECORD_SIZE (I2S_CHANNEL_NUM * I2S_SAMPLE_RATE * I2S_SAMPLE_BITS / 8 * RECORD_TIME)

File file;
SemaphoreHandle_t i2sFinishedSemaphore;
const char audioRecordfile[] = "/recording.wav";
const char audioResponsefile[] = "/voicedby.wav";
const int headerSize = 44;

bool isWIFIConnected;

// Node Js server Adresses
const char *serverUploadUrl = "http://192.168.0.15:3000/uploadAudio";
const char *serverBroadcastUrl = "http://192.168.0.15:3000/broadcastAudio";
const char *broadcastPermitionUrl = "http://192.168.0.15:3000/checkVariable";

// Prototypes
void SPIFFSInit();
void listSPIFFS(void);
void i2sInitINMP441();
void wavHeader(byte *header, int wavSize);
void i2s_adc(void *arg);
void wifiConnect(void *pvParameters);
void semaphoreWait(void *arg);
void uploadFile();
void i2sInitMax98357A();
void broadcastAudio(void *arg);
void printSpaceInfo();

void setup()
{
  esp_sleep_enable_ext0_wakeup(Button_Pin, 1);
  if (digitalRead(Button_Pin) == LOW)
  {
    esp_deep_sleep_start();
  }

  Serial.begin(115200);
  TickDelay(500);
  pinMode(isWifiConnectedPin, OUTPUT);
  digitalWrite(isWifiConnectedPin, LOW);
  pinMode(isAudioRecording, OUTPUT);
  digitalWrite(isAudioRecording, LOW);

  SPIFFSInit();
  i2sInitINMP441();
  i2sFinishedSemaphore = xSemaphoreCreateBinary();
  xTaskCreate(i2s_adc, "i2s_adc", 4096, NULL, 2, NULL);
  TickDelay(500);
  xTaskCreate(wifiConnect, "wifi_Connect", 2048, NULL, 1, NULL);
  TickDelay(500);
  xTaskCreate(semaphoreWait, "semaphoreWait", 2048, NULL, 0, NULL);
}

void loop()
{
}

void SPIFFSInit()
{
  if (!SPIFFS.begin(true))
  {
    Serial.println("SPIFFS initialisation failed!");
    while (1)
      yield();
  }

  // format_Spiffs();
  if (SPIFFS.exists(audioRecordfile))
  {
    SPIFFS.remove(audioRecordfile);
  }
  if (SPIFFS.exists(audioResponsefile))
  {
    SPIFFS.remove(audioResponsefile);
  }

  file = SPIFFS.open(audioRecordfile, FILE_WRITE);
  if (!file)
  {
    Serial.println("File is not available!");
  }

  byte header[headerSize];
  wavHeader(header, FLASH_RECORD_SIZE);

  file.write(header, headerSize);
  listSPIFFS();
}

void i2sInitINMP441()
{
  i2s_config_t i2s_config = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
      .sample_rate = I2S_SAMPLE_RATE,
      .bits_per_sample = i2s_bits_per_sample_t(I2S_SAMPLE_BITS),
      .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
      .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_STAND_I2S),
      .intr_alloc_flags = 0,
      .dma_buf_count = 64,
      .dma_buf_len = 1024,
      .use_apll = 1};

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);

  const i2s_pin_config_t pin_config = {
      .bck_io_num = I2S_SCK,
      .ws_io_num = I2S_WS,
      .data_out_num = -1,
      .data_in_num = I2S_SD};

  i2s_set_pin(I2S_PORT, &pin_config);
}

void i2s_adc_data_scale(uint8_t *d_buff, uint8_t *s_buff, uint32_t len)
{
  uint32_t j = 0;
  uint32_t dac_value = 0;
  for (int i = 0; i < len; i += 2)
  {
    dac_value = ((((uint16_t)(s_buff[i + 1] & 0xf) << 8) | ((s_buff[i + 0]))));
    d_buff[j++] = 0;
    d_buff[j++] = dac_value * 256 / 2048;
  }
}

void i2s_adc(void *arg)
{

  int i2s_read_len = I2S_READ_LEN;
  int flash_wr_size = 0;
  size_t bytes_read;

  char *i2s_read_buff = (char *)calloc(i2s_read_len, sizeof(char));
  uint8_t *flash_write_buff = (uint8_t *)calloc(i2s_read_len, sizeof(char));

  i2s_read(I2S_PORT, (void *)i2s_read_buff, i2s_read_len, &bytes_read, portMAX_DELAY);
  i2s_read(I2S_PORT, (void *)i2s_read_buff, i2s_read_len, &bytes_read, portMAX_DELAY);

  digitalWrite(isAudioRecording, HIGH);
  Serial.println(" *** Recording Start *** ");
  while (flash_wr_size < FLASH_RECORD_SIZE)
  {
    // read data from I2S bus, in this case, from ADC.
    i2s_read(I2S_PORT, (void *)i2s_read_buff, i2s_read_len, &bytes_read, portMAX_DELAY);

    // save original data from I2S(ADC) into flash.
    i2s_adc_data_scale(flash_write_buff, (uint8_t *)i2s_read_buff, i2s_read_len);
    file.write((const byte *)flash_write_buff, i2s_read_len);
    flash_wr_size += i2s_read_len;
    ets_printf("Sound recording %u%%\n", flash_wr_size * 100 / FLASH_RECORD_SIZE);
    ets_printf("Never Used Stack Size: %u\n", uxTaskGetStackHighWaterMark(NULL));
  }

  file.close();

  digitalWrite(isAudioRecording, LOW);

  free(i2s_read_buff);
  i2s_read_buff = NULL;
  free(flash_write_buff);
  flash_write_buff = NULL;

  listSPIFFS();

  if (isWIFIConnected)
  {
    uploadFile();
  }

  xSemaphoreGive(i2sFinishedSemaphore); // После завершения задачи i2s_adc отдаем семафор
  vTaskDelete(NULL);
}

void wavHeader(byte *header, int wavSize)
{
  header[0] = 'R';
  header[1] = 'I';
  header[2] = 'F';
  header[3] = 'F';
  unsigned int fileSize = wavSize + headerSize - 8;
  header[4] = (byte)(fileSize & 0xFF);
  header[5] = (byte)((fileSize >> 8) & 0xFF);
  header[6] = (byte)((fileSize >> 16) & 0xFF);
  header[7] = (byte)((fileSize >> 24) & 0xFF);
  header[8] = 'W';
  header[9] = 'A';
  header[10] = 'V';
  header[11] = 'E';
  header[12] = 'f';
  header[13] = 'm';
  header[14] = 't';
  header[15] = ' ';
  header[16] = 0x10;
  header[17] = 0x00;
  header[18] = 0x00;
  header[19] = 0x00;
  header[20] = 0x01;
  header[21] = 0x00;
  header[22] = 0x01;
  header[23] = 0x00;
  header[24] = 0x80;
  header[25] = 0x3E;
  header[26] = 0x00;
  header[27] = 0x00;
  header[28] = 0x00;
  header[29] = 0x7D;
  header[30] = 0x01;
  header[31] = 0x00;
  header[32] = 0x02;
  header[33] = 0x00;
  header[34] = 0x10;
  header[35] = 0x00;
  header[36] = 'd';
  header[37] = 'a';
  header[38] = 't';
  header[39] = 'a';
  header[40] = (byte)(wavSize & 0xFF);
  header[41] = (byte)((wavSize >> 8) & 0xFF);
  header[42] = (byte)((wavSize >> 16) & 0xFF);
  header[43] = (byte)((wavSize >> 24) & 0xFF);
}

void listSPIFFS(void)
{
  // DEBUG
  printSpaceInfo();
  Serial.println(F("\r\nListing SPIFFS files:"));
  static const char line[] PROGMEM = "=================================================";

  Serial.println(FPSTR(line));
  Serial.println(F("  File name                              Size"));
  Serial.println(FPSTR(line));

  fs::File root = SPIFFS.open("/");
  if (!root)
  {
    Serial.println(F("Failed to open directory"));
    return;
  }
  if (!root.isDirectory())
  {
    Serial.println(F("Not a directory"));
    return;
  }

  fs::File file = root.openNextFile();
  while (file)
  {

    if (file.isDirectory())
    {
      Serial.print("DIR : ");
      String fileName = file.name();
      Serial.print(fileName);
    }
    else
    {
      String fileName = file.name();
      Serial.print("  " + fileName);
      // File path can be 31 characters maximum in SPIFFS
      int spaces = 33 - fileName.length(); // Tabulate nicely
      if (spaces < 1)
        spaces = 1;
      while (spaces--)
        Serial.print(" ");
      String fileSize = (String)file.size();
      spaces = 10 - fileSize.length(); // Tabulate nicely
      if (spaces < 1)
        spaces = 1;
      while (spaces--)
        Serial.print(" ");
      Serial.println(fileSize + " bytes");
    }

    file = root.openNextFile();
  }

  Serial.println(FPSTR(line));
  Serial.println();
  TickDelay(1000);
}

void wifiConnect(void *pvParameters)
{
  isWIFIConnected = false;

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  if (WiFi.status() != WL_CONNECTED)
  {
    digitalWrite(isWifiConnectedPin, LOW);
  }
  while (WiFi.status() != WL_CONNECTED)
  {
    vTaskDelay(500);
    Serial.print(".");
  }
  isWIFIConnected = true;
  digitalWrite(isWifiConnectedPin, HIGH);
  while (true)
  {
    vTaskDelay(1000);
  }
}

void uploadFile()
{
  file = SPIFFS.open(audioRecordfile, FILE_READ);
  if (!file)
  {
    Serial.println("FILE IS NOT AVAILABLE!");
    return;
  }

  Serial.println("===> Upload FILE to Node.js Server");

  HTTPClient client;
  client.begin(serverUploadUrl);
  client.addHeader("Content-Type", "audio/wav");
  int httpResponseCode = client.sendRequest("POST", &file, file.size());
  Serial.print("httpResponseCode : ");
  Serial.println(httpResponseCode);

  if (httpResponseCode == 200)
  {
    String response = client.getString();
    Serial.println("==================== Transcription ====================");
    Serial.println(response);
    Serial.println("====================      End      ====================");
  }
  else
  {
    Serial.println("Server is not available... Deep sleep.");
    esp_deep_sleep_start();
  }
  file.close();
  client.end();

  // Освобождение I2S ресурсов
  i2s_driver_uninstall(I2S_NUM_0);
}

void semaphoreWait(void *arg)
{
  HTTPClient http;
  while (true)
  {
    if (xSemaphoreTake(i2sFinishedSemaphore, 0) == pdTRUE)
    {
      http.begin(broadcastPermitionUrl);
      int httpResponseCode = http.GET();

      if (httpResponseCode > 0)
      {
        String payload = http.getString();
        // Serial.println("Payload Value- " + payload);

        if (payload.indexOf("\"ready\":true") > -1)
        {
          Serial.println("Recieving confirmed! Start broadcasting...");
          xTaskCreate(broadcastAudio, "broadcastAudio", 4096, NULL, 2, NULL);
          http.end();
          break;
        }
        else
        {
          Serial.println("Waiting for broadcast confirmation from Server...");
        }
      }
      else
      {
        Serial.print("HTTP request failed with error code: ");
        Serial.println(httpResponseCode);
        Serial.println("Start sleep.");
        esp_deep_sleep_start();
      }
      xSemaphoreGive(i2sFinishedSemaphore);
      http.end();
    }
    vTaskDelay(500);
  }

  vTaskDelete(NULL);
}

void broadcastAudio(void *arg)
{
  // Initialisation first
  i2sInitMax98357A();

  HTTPClient http;
  http.begin(serverBroadcastUrl);

  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK)
  {
    WiFiClient *stream = http.getStreamPtr();
    uint8_t buffer[MAX_I2S_READ_LEN];

    Serial.println("Starting broadcastAudio ");
    while (stream->connected() && stream->available())
    {
      int len = stream->read(buffer, sizeof(buffer));
      if (len > 0)
      {
        size_t bytes_written;
        i2s_write((i2s_port_t)MAX_I2S_NUM, buffer, len, &bytes_written, portMAX_DELAY);
      }
    }
    Serial.println("Audio playback completed");
  }
  else
  {
    Serial.printf("HTTP GET failed, error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();

  // Освобождение I2S ресурсов
  i2s_driver_uninstall(MAX_I2S_NUM);

  // Going to sleep
  Serial.println("Going to sleep after broadcsting");
  esp_deep_sleep_start();
  vTaskDelete(NULL); // in case deepsleepfunc doesn't work properly
}

void i2sInitMax98357A()
{
  i2s_config_t i2s_config = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = MAX_I2S_SAMPLE_RATE,
      .bits_per_sample = i2s_bits_per_sample_t(MAX_I2S_SAMPLE_BITS),
      .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 8,
      .dma_buf_len = MAX_I2S_READ_LEN,
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0};

  i2s_pin_config_t pin_config = {
      .bck_io_num = I2S_BCLK,
      .ws_io_num = I2S_LRC,
      .data_out_num = I2S_DOUT,
      .data_in_num = I2S_PIN_NO_CHANGE};

  i2s_driver_install(MAX_I2S_NUM, &i2s_config, 0, NULL);
  i2s_set_pin(MAX_I2S_NUM, &pin_config);
  i2s_zero_dma_buffer(MAX_I2S_NUM);
}

void printSpaceInfo()
{
  size_t totalBytes = SPIFFS.totalBytes();
  size_t usedBytes = SPIFFS.usedBytes();
  size_t freeBytes = totalBytes - usedBytes;

  Serial.print("Total space: ");
  Serial.println(totalBytes);
  Serial.print("Used space: ");
  Serial.println(usedBytes);
  Serial.print("Free space: ");
  Serial.println(freeBytes);
}
