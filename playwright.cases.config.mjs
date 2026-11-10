import base from './playwright.config.mjs';
export default { ...base, testMatch: '**/cases.ui.spec.mjs', timeout: 45000 };
