#!/bin/bash
# Test SSE endpoint with fake image

echo "Testing SSE endpoint..."

# Create a simple POST request to /api/chat/stream
curl -N -X POST http://localhost:4000/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Cookie: user_id=meaqua" \
  -d '{
    "messages": [{
      "role": "user",
      "content": "test",
      "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    }],
    "language": "zh",
    "catId": "default"
  }' \
  --max-time 10 \
  2>&1 | tee /tmp/sse-test-output.txt

echo ""
echo "====================================="
echo "Output saved to /tmp/sse-test-output.txt"
echo ""
echo "Checking for token events..."
grep -c '"type":"token"' /tmp/sse-test-output.txt || echo "No token events found!"
echo ""
echo "Checking for done event..."
grep '"type":"done"' /tmp/sse-test-output.txt || echo "No done event found!"
