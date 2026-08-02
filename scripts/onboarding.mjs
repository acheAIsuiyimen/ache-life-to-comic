import path from "node:path";
import {atomicWriteJson, readJsonIfExists} from "./io.mjs";

export const ONBOARDING_VERSION = "ache-onboarding/1.1.0";

const STEPS = [
  {
    id: "style",
    prompt: "先为这本书挑一种呼吸感。",
    selector: "assets/presets/style-selector.png",
    options: [
      {value: "02-snow-pastel", label: "02 雪色粉蜡（默认）"},
      {value: "01-cloud-gouache", label: "01 云层水粉"},
      {value: "03-white-pencil", label: "03 白纸彩铅"},
      {value: "04-two-color-line", label: "04 双色线记"},
      {value: "05-ink-watercolor", label: "05 细墨轻彩"},
      {value: "custom-reference", label: "上传 1–5 张参考图"}
    ],
    defaultValue: "02-snow-pastel"
  },
  {
    id: "character",
    prompt: "要不要让自己的角色，偶尔从书里路过？",
    options: [
      {value: "none", label: "暂时没有（默认）"},
      {value: "custom", label: "带上我的人物、宠物、物件或 IP"},
      {value: "66-dawang", label: "66 大王（内置角色示例）"}
    ],
    defaultValue: "none"
  },
  {
    id: "publication",
    prompt: "这本书准备放在哪里继续长大？",
    options: [
      {value: "local-html", label: "本地 HTML 月册（默认）"},
      {value: "feishu", label: "飞书月册"},
      {value: "github", label: "GitHub 连载站"},
      {value: "local-then-sync", label: "先本地，之后再同步"}
    ],
    defaultValue: "local-html"
  },
  {
    id: "book",
    prompt: "最后，给它一个名字。",
    options: [
      {value: "default", label: "《我的漫画人生》（默认）"},
      {value: "custom", label: "我来命名"},
      {value: "existing", label: "续更已有书"}
    ],
    defaultValue: "default"
  }
];

function publicStep(step, index) {
  return {
    version: ONBOARDING_VERSION,
    status: "question",
    progress: `${index + 1}/${STEPS.length}`,
    question: step.prompt,
    selector: step.selector ?? null,
    selectorRequired: Boolean(step.selector),
    options: step.options,
    defaultValue: step.defaultValue
  };
}

export function startOnboarding() {
  return {
    state: {
      version: ONBOARDING_VERSION,
      status: "in-progress",
      stepIndex: 0,
      answers: {}
    },
    view: publicStep(STEPS[0], 0)
  };
}

export function answerOnboarding(state, answer) {
  if (state?.version !== ONBOARDING_VERSION || state.status !== "in-progress") {
    throw new Error("Invalid onboarding state");
  }
  const step = STEPS[state.stepIndex];
  const value = answer ?? step.defaultValue;
  if (!step.options.some((option) => option.value === value)) {
    throw new Error(`Unsupported answer for ${step.id}`);
  }
  const answers = {...state.answers, [step.id]: value};
  const nextIndex = state.stepIndex + 1;
  if (nextIndex < STEPS.length) {
    const nextState = {...state, stepIndex: nextIndex, answers};
    return {state: nextState, view: publicStep(STEPS[nextIndex], nextIndex)};
  }
  return {
    state: {
      ...state,
      status: "complete",
      stepIndex: nextIndex,
      answers
    },
    view: {
      version: ONBOARDING_VERSION,
      status: "complete",
      message: "创刊完成。现在，把第一段想留下的内容发来吧。"
    }
  };
}

export function profileFromOnboarding(state, {
  bookId = "my-comic-life",
  customTitle = null
} = {}) {
  if (state?.status !== "complete") {
    throw new Error("Onboarding must be complete before creating a profile");
  }
  const styleId = state.answers.style;
  const title = state.answers.book === "custom" && customTitle
    ? customTitle
    : "我的漫画人生";
  const characterId = state.answers.character;
  return {
    schemaVersion: "1.1.0",
    onboardingVersion: ONBOARDING_VERSION,
    designSystemVersion: "ache-design-system/1.2.0",
    bookId,
    title,
    style: {
      id: styleId,
      lifecycle: styleId === "02-snow-pastel"
        ? "validated_preset"
        : styleId === "custom-reference"
          ? "custom_candidate"
          : "optional_candidate"
    },
    character: characterId === "none"
      ? {mode: "none", ids: []}
      : {mode: "recurring", ids: [characterId]},
    publication: {
      primary: state.answers.publication,
      mirrors: []
    },
    visualFallback: null,
    continuity: "weak",
    episodeCover: true,
    budget: "standard"
  };
}

export async function saveOnboardingState(filePath, state) {
  await atomicWriteJson(path.resolve(filePath), state);
}

export async function loadOnboardingState(filePath) {
  return readJsonIfExists(path.resolve(filePath));
}
