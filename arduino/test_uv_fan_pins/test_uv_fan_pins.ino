const uint8_t UV_PIN = 6;
const uint8_t FAN_PIN = 7;

void setup() {
  pinMode(UV_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  digitalWrite(UV_PIN, LOW);
  digitalWrite(FAN_PIN, LOW);
  Serial.begin(115200);
  Serial.println(F("Testing D6/D7 outputs"));
}

void loop() {
  Serial.println(F("UV ON, FAN OFF"));
  digitalWrite(UV_PIN, HIGH);
  digitalWrite(FAN_PIN, LOW);
  delay(2000);

  Serial.println(F("UV OFF, FAN ON"));
  digitalWrite(UV_PIN, LOW);
  digitalWrite(FAN_PIN, HIGH);
  delay(2000);

  Serial.println(F("Both OFF"));
  digitalWrite(UV_PIN, LOW);
  digitalWrite(FAN_PIN, LOW);
  delay(2000);
}
