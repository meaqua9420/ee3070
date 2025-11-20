#pragma once

#include <stdint.h>

#ifdef ENABLE_AUDIO

// 音訊模式定義 / Audio pattern identifiers
enum AudioPattern : uint8_t {
  AUDIO_PATTERN_NONE = 0,
  AUDIO_PATTERN_CALL = 1,
  AUDIO_PATTERN_CALM = 2,
  AUDIO_PATTERN_ALERT = 3,
  AUDIO_PATTERN_WAKE = 4,
  AUDIO_PATTERN_HYDRATE = 5,
  AUDIO_PATTERN_MEOW = 6,
};

// 音訊序列步驟 / Audio sequence step definition
struct AudioSequenceStep {
  uint16_t frequencyHz;
  uint16_t durationMs;
  uint8_t amplitudePercent;
};

#endif  // ENABLE_AUDIO
