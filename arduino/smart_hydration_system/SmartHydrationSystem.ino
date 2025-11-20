/*
  Smart Hydration System – Updated Sketch
  ---------------------------------------
  - Relay module on D23 controls the water pump (active HIGH).
  - Analog water sensor on A5 monitors bowl water level.
  - Manual pump button on D25 allows on-demand refills.
  - DS3231 RTC schedules hydration checks at 08:00, 12:00, 16:00, and 20:00.
*/

#include <Wire.h>
#include "RTClib.h"

RTC_DS3231 rtc;

const int relayPin = 23;        // Relay controlling the water pump
const int waterSensorPin = A5;  // Analog water sensor input
const int buttonPin = 25;       // Manual pump button
const int waterThreshold = 400; // Threshold for water level

bool hasPumpedMorning = false;
bool hasPumpedNoon = false;
bool hasPumpedAfternoon = false;
bool hasPumpedEvening = false;
bool hasResetToday = false;
bool buttonWasPressed = false;

unsigned long startupTime = 0;

int getAverageWaterLevel(int pin, int samples = 10, int delayMs = 50);
void handleHydration();

void setup() {
  delay(2000);  // Startup delay
  startupTime = millis();

  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW);  // Pump OFF (active HIGH relay)

  pinMode(buttonPin, INPUT_PULLUP);

  Serial.begin(9600);

  if (!rtc.begin()) {
    Serial.println(F("Couldn't find RTC"));
    while (true) {
      delay(10);
    }
  }

  if (rtc.lostPower()) {
    Serial.println(F("RTC lost power, setting time!"));
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
}

void loop() {
  DateTime now = rtc.now();

  if (millis() - startupTime > 5000) {
    bool buttonPressed = (digitalRead(buttonPin) == LOW);

    if (buttonPressed) {
      buttonWasPressed = true;
      int waterLevel = getAverageWaterLevel(waterSensorPin);
      Serial.print(F("Manual button triggered - Current water level: "));
      Serial.println(waterLevel);

      if (waterLevel < waterThreshold) {
        digitalWrite(relayPin, HIGH);  // Pump ON
      } else {
        digitalWrite(relayPin, LOW);   // Pump OFF
        Serial.println(F("Water level sufficient - Pump stopped."));
      }
    } else if (buttonWasPressed) {
      buttonWasPressed = false;
      digitalWrite(relayPin, LOW);  // Ensure pump OFF
      int finalLevel = getAverageWaterLevel(waterSensorPin);
      Serial.print(F("Button released - Final stable water level: "));
      Serial.println(finalLevel);
    }
  }

  if (millis() - startupTime > 5000) {
    if (now.hour() == 8 && now.minute() < 2 && !hasPumpedMorning) {
      Serial.println(F("Scheduled hydration triggered: Morning"));
      handleHydration();
      hasPumpedMorning = true;
    }

    if (now.hour() == 12 && now.minute() < 2 && !hasPumpedNoon) {
      Serial.println(F("Scheduled hydration triggered: Noon"));
      handleHydration();
      hasPumpedNoon = true;
    }

    if (now.hour() == 16 && now.minute() < 2 && !hasPumpedAfternoon) {
      Serial.println(F("Scheduled hydration triggered: Afternoon"));
      handleHydration();
      hasPumpedAfternoon = true;
    }

    if (now.hour() == 20 && now.minute() < 2 && !hasPumpedEvening) {
      Serial.println(F("Scheduled hydration triggered: Evening"));
      handleHydration();
      hasPumpedEvening = true;
    }
  }

  if (now.hour() == 0 && now.minute() == 0 && now.second() < 5 && !hasResetToday) {
    hasPumpedMorning = false;
    hasPumpedNoon = false;
    hasPumpedAfternoon = false;
    hasPumpedEvening = false;
    hasResetToday = true;
    Serial.println(F("Flags reset for new day."));
  }

  if (now.hour() > 0 && hasResetToday) {
    hasResetToday = false;
  }

  delay(1000);
}

int getAverageWaterLevel(int pin, int samples, int delayMs) {
  long total = 0;
  for (int i = 0; i < samples; i++) {
    total += analogRead(pin);
    delay(delayMs);
  }
  return static_cast<int>(total / samples);
}

void handleHydration() {
  int retryCount = 0;
  int waterLevel = getAverageWaterLevel(waterSensorPin);

  Serial.print(F("Initial average water level: "));
  Serial.println(waterLevel);

  while (waterLevel < waterThreshold && retryCount < 3) {
    Serial.print(F("Water low. Pumping attempt "));
    Serial.println(retryCount + 1);

    digitalWrite(relayPin, HIGH);  // Pump ON
    delay(1000);
    digitalWrite(relayPin, LOW);   // Pump OFF

    retryCount++;
    delay(3000);
    waterLevel = getAverageWaterLevel(waterSensorPin);

    Serial.print(F("Water level after attempt "));
    Serial.print(retryCount);
    Serial.print(F(": "));
    Serial.println(waterLevel);
  }

  if (waterLevel >= waterThreshold) {
    Serial.println(F("Water level sufficient after pumping."));
  } else {
    Serial.println(F("Max retries reached. Water still low."));
  }
}
