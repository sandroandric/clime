export default {
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix --no-warn-ignored --cache'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
