export type ChapterInfo = {
  kind?: "act" | "chapter";
  numbered?: boolean;
  title?: string;
  role?: string;
  contents?: boolean;
  contentsFile?: string;
};

export type MatterTemplate = {
  name: string;
  role: string;
  content: string;
  contents?: boolean;
};

export type ManuscriptSettings = {
  showNumbers: boolean;
  showTitles: boolean;
  roles: string[];
  templates: MatterTemplate[];
};

export const defaultManuscriptSettings: ManuscriptSettings = {
  showNumbers: true,
  showTitles: true,
  roles: ["Prologue", "Epilogue", "Preface", "Foreword", "Afterword", "Interlude", "Dedication", "Acknowledgements", "About the author", "Copyright", "Table of contents"],
  templates: [
    { name: "Copyright", role: "Copyright", content: "Copyright © {{year}} {{author}}\n\nAll rights reserved." },
    { name: "Dedication", role: "Dedication", content: "" },
    { name: "Table of contents", role: "Table of contents", content: "", contents: true },
    { name: "Foreword", role: "Foreword", content: "" },
    { name: "Preface", role: "Preface", content: "" },
    { name: "Prologue", role: "Prologue", content: "" },
    { name: "Epilogue", role: "Epilogue", content: "" },
    { name: "Afterword", role: "Afterword", content: "" },
    { name: "Acknowledgements", role: "Acknowledgements", content: "" },
    { name: "About the author", role: "About the author", content: "About {{author}}" },
  ],
};

export function manuscriptSettings(value?: Partial<ManuscriptSettings>): ManuscriptSettings {
  return {
    showNumbers: value?.showNumbers !== false,
    showTitles: value?.showTitles !== false,
    roles: Array.isArray(value?.roles) ? value.roles : defaultManuscriptSettings.roles,
    templates: Array.isArray(value?.templates) ? value.templates : defaultManuscriptSettings.templates,
  };
}

export function isNumberedChapter(name: string, info: ChapterInfo) {
  return !info.role && (info.numbered ?? /^chapter(?:\s+\d+)?$/i.test(name));
}

export function chapterLabel(name: string, info: ChapterInfo, number: number, settings: ManuscriptSettings) {
  if (info.role) return info.role;
  if (!isNumberedChapter(name, info)) return name;
  return [settings.showNumbers ? `Chapter ${number}` : "", settings.showTitles ? info.title?.trim() : ""].filter(Boolean).join(" — ");
}
