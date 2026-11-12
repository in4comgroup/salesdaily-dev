import { parseAiConfig, AiConfigurationError } from "../../src/server/ai/config"

// Test-only fixtures. The app reads its AI configuration from the database
// (ai_config_version); these documents replace the former config/ai/*.json.

export const TEXT_URI = "gpt://test-folder/yandexgpt-5.1"
export const VISION_URI = "gpt://test-folder/vision-test"

// Base Yandex profile: text processes on; files, search, voice off.
const YANDEX_FIXTURE = {
  "version": 2,
  "features": {
    "webSearch": false,
    "websiteFetch": false,
    "browserSpeechRecognition": false,
    "serverSpeechRecognition": false
  },
  "files": {
    "images": "vision",
    "maxMediaSeconds": 180,
    "pdfMaxPages": 10
  },
  "services": {
    "ocr": false,
    "speech": false,
    "search": false
  },
  "models": {
    "yandex-text": {
      "enabled": true,
      "label": "Yandex AI Studio",
      "capabilities": [
        "text",
        "structuredOutput",
        "tools",
        "streaming"
      ],
      "uri": "gpt://test-folder/yandexgpt-5.1"
    },
    "yandex-vision": {
      "enabled": false,
      "label": "Yandex Vision",
      "capabilities": [
        "text",
        "image"
      ],
      "uri": "gpt://test-folder/vision-test"
    }
  },
  "tasks": {
    "chat": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "analytics": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "cards": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "deals": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "orderRequest": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "chatSummary": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "companyResearch": {
      "enabled": false,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "companyExtraction": {
      "enabled": false,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "parseText": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "parsePdf": {
      "enabled": false,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "parseImage": {
      "enabled": false,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "parseAudio": {
      "enabled": false,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "parseVideo": {
      "enabled": false,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "parseOffice": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "orgAttribution": {
      "enabled": true,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "webSearch": {
      "enabled": false,
      "defaultModel": "yandex-text",
      "allowedModels": [
        "yandex-text"
      ]
    },
    "describeImage": {
      "enabled": false,
      "defaultModel": "yandex-vision",
      "allowedModels": [
        "yandex-vision"
      ]
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests mutate unknown keys on purpose
export function yandexFixture(): any {
  return structuredClone(YANDEX_FIXTURE)
}

// Enables a full list of stage-3 functions with their dependencies (was the
// `profile` CLI command).
export function withFunctions(input: unknown, enable: readonly string[]) {
  const config = parseAiConfig(input)
  const allowed = ["images", "pdf", "audio", "video", "search", "voice"]
  if (enable.some((name) => !allowed.includes(name))) throw new AiConfigurationError("Unknown stage-3 feature")
  if (enable.includes("video")) throw new AiConfigurationError("Video is unavailable without local decoding; do not enable it in the Yandex profile")
  const vision = enable.includes("images")
  const ocr = enable.includes("pdf")
  const speech = enable.some((name) => ["audio", "voice"].includes(name))
  const search = enable.includes("search")
  if (!config.models["yandex-vision"]) throw new AiConfigurationError("Use the canonical Yandex config as input")
  config.models["yandex-vision"].enabled = vision
  const tasks = { describeImage: vision, parseImage: enable.includes("images"), parsePdf: enable.includes("pdf"),
    parseAudio: enable.includes("audio"), parseVideo: false, webSearch: search, companyResearch: search, companyExtraction: search }
  for (const [task, enabled] of Object.entries(tasks)) {
    const definition = config.tasks[task as keyof typeof config.tasks]
    if (!definition) throw new AiConfigurationError("Missing stage-3 task")
    definition.enabled = enabled
  }
  config.services.ocr = ocr
  config.services.speech = speech
  config.services.search = search
  config.features.webSearch = search
  config.features.serverSpeechRecognition = enable.includes("voice")
  config.features.browserSpeechRecognition = false
  config.features.websiteFetch = false
  return parseAiConfig(config)
}
