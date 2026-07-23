/*
------------------------------------------------------
Project : Smart Parking Assistant
Board   : Arduino Uno
Sensor  : HC-SR04 Ultrasonic Sensor
Buzzer  : Passive Piezo Buzzer
------------------------------------------------------
*/

// Pin Connections
const int trigPin = 9;
const int echoPin = 10;
const int buzzerPin = 7;

void setup()
{
  // Start Serial Communication
  Serial.begin(9600);

  // Set Pin Modes
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(buzzerPin, OUTPUT);

  // Stop buzzer initially
  noTone(buzzerPin);
}

void loop()
{
  // Send ultrasonic pulse
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);

  digitalWrite(trigPin, LOW);

  // Measure echo time
  long duration = pulseIn(echoPin, HIGH, 30000);

  // Calculate distance
  int distance;

  if (duration == 0)
  {
    distance = 400;      // No object detected
  }
  else
  {
    distance = duration * 0.034 / 2;
  }

  // Keep distance within valid range
  if (distance < 2)
    distance = 2;

  if (distance > 400)
    distance = 400;

  // Send only the distance to Python
  Serial.println(distance);

  // Check if Python has sent any command
  if (Serial.available() > 0)
  {
    char command = Serial.read();

    // Turn buzzer ON
    if (command == 'H')
    {
      tone(buzzerPin, 1000);   // 1000 Hz sound
    }

    // Turn buzzer OFF
    else if (command == 'L')
    {
      noTone(buzzerPin);
    }
  }

  delay(200);
}