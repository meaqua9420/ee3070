/*
  Smart Pet Feeder System – Updated Sketch
  ----------------------------------------
  - Servo motor on D9 controls the feeder gate.
  - HX711 load cell amplifier on D5 (DT) / D4 (SCK) measures bowl weight.
  - DS3231 RTC schedules automatic feedings at 08:00 and 18:00.
  - Buttons:
      D11 → Tare
      D8  → Reset / emergency stop
      D10 → Calibrate
      D3  → Manual feed trigger
*/

#include <Servo.h>
#include "HX711.h"
#include <Wire.h>
#include "RTClib.h"

Servo feederServo;
HX711 bowlScale;
RTC_DS3231 rtc;

const int servoPin = 9;
const int dtPin = 5;   // HX711 DT
const int sckPin = 4;  // HX711 SCK
const int tareButtonPin = 11;
const int resetButtonPin = 8;
const int calibrateButtonPin = 10;
const int feedButtonPin = 3;

float targetWeight = 50.0f;   // grams to dispense
float minBowlWeight = 30.0f;  // grams already acceptable in bowl
bool feeding = false;
bool calibrationMode = false;

void setup() {
  Serial.begin(9600);

  feederServo.attach(servoPin);
  feederServo.write(0);  // Ensure gate is closed on startup

  bowlScale.begin(dtPin, sckPin);
  bowlScale.set_scale(414.7031f);  // Default scale factor

  delay(1000);  // Allow the scale to stabilize
  float initialWeight = bowlScale.get_units(10);
  if (initialWeight < 5.0f) {
    bowlScale.tare();
    Serial.println(F("Scale tared (bowl was empty)."));
  } else {
    Serial.print(F("Scale not tared. Detected weight: "));
    Serial.println(initialWeight);
  }

  pinMode(tareButtonPin, INPUT_PULLUP);
  pinMode(resetButtonPin, INPUT_PULLUP);
  pinMode(calibrateButtonPin, INPUT_PULLUP);
  pinMode(feedButtonPin, INPUT_PULLUP);

  Wire.begin();
  if (!rtc.begin()) {
    Serial.println(F("Couldn't find RTC"));
    while (true) {
      delay(10);
    }
  }

  Serial.println(F("Smart Pet Feeder ready."));
}

void loop() {
  if (digitalRead(tareButtonPin) == LOW) {
    Serial.println(F("Tare button pressed. Taring scale..."));
    bowlScale.tare();
    delay(1000);
  }

  if (digitalRead(resetButtonPin) == LOW) {
    Serial.println(F("Reset button pressed. Servo to 0°"));
    feederServo.write(0);
    feeding = false;
    delay(1000);
  }

  if (digitalRead(calibrateButtonPin) == LOW && !calibrationMode) {
    calibrationMode = true;
    calibrateScale();
    calibrationMode = false;
    return;
  }

  if (digitalRead(feedButtonPin) == LOW && !feeding) {
    Serial.println(F("Feed button pressed. Starting feeding..."));
    checkAndFeed();
    delay(1000);
  }

  DateTime now = rtc.now();
  bool morningSlot = (now.hour() == 8 && now.minute() == 0);
  bool eveningSlot = (now.hour() == 18 && now.minute() == 0);
  if ((morningSlot || eveningSlot) && !feeding) {
    checkAndFeed();
  }

  delay(500);
}

void checkAndFeed() {
  float bowlWeight = bowlScale.get_units();
  Serial.print(F("Current bowl weight: "));
  Serial.println(bowlWeight);

  if (bowlWeight >= minBowlWeight) {
    Serial.println(F("Bowl already has enough food. Skipping feeding."));
    return;
  }

  startFeeding();
}

void startFeeding() {
  feeding = true;
  Serial.println(F("Feeding started..."));
  feederServo.write(180);  // Open gate
  delay(500);

  while (bowlScale.get_units() < targetWeight) {
    if (digitalRead(resetButtonPin) == LOW) {
      Serial.println(F("⛔ Reset button pressed. Stopping feeding."));
      break;
    }
    if (digitalRead(feedButtonPin) == HIGH) {
      Serial.println(F("🛑 Feed button released. Stopping feeding."));
      break;
    }

    Serial.print(F("Current bowl weight: "));
    Serial.println(bowlScale.get_units());
    delay(500);
  }

  feederServo.write(0);  // Close gate
  Serial.println(F("Feeding stopped or complete."));
  feeding = false;
}

void calibrateScale() {
  Serial.println(F("🔧 Calibration Mode Started"));
  Serial.println(F("1️⃣ Remove all weight from the scale."));
  Serial.println(F("   Press Enter in Serial Monitor when ready to tare..."));

  while (Serial.available() == 0) {
    delay(100);
  }
  Serial.read();  // Clear newline

  delay(1000);
  long rawNoWeight = bowlScale.read_average(20);
  Serial.print(F("📏 Raw no weight: "));
  Serial.println(rawNoWeight);

  Serial.println(F("2️⃣ Place a known weight on the scale."));
  Serial.println(F("   Enter the weight in grams (e.g., 308):"));

  while (Serial.available() == 0) {
    delay(100);
  }
  float knownWeight = Serial.parseFloat();
  Serial.print(F("✅ Known weight entered: "));
  Serial.print(knownWeight);
  Serial.println(F(" g"));

  delay(2000);
  long rawWithWeight = bowlScale.read_average(20);
  Serial.print(F("📏 Raw with weight: "));
  Serial.println(rawWithWeight);

  long diff = rawWithWeight - rawNoWeight;
  if (diff == 0 || knownWeight <= 0) {
    Serial.println(F("❌ Error: Invalid readings or weight. Calibration failed."));
    return;
  }

  float newScale = static_cast<float>(diff) / knownWeight;
  bowlScale.set_scale(newScale);
  Serial.print(F("✅ New scale factor: "));
  Serial.println(newScale, 4);

  delay(1000);
  float finalReading = bowlScale.get_units(20);
  Serial.print(F("📦 Final verification reading: "));
  Serial.print(finalReading, 2);
  Serial.println(F(" g"));

  Serial.println(F("🎉 Calibration complete!"));
  while (Serial.available()) {
    Serial.read();
  }
}
