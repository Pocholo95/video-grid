import css from "@eslint/css";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "__tests__/coverage/**"],
  },
  // Markdown linting
  ...markdown.configs.recommended,
  // CSS linting - tolerant mode for Tailwind custom syntax
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    languageOptions: {
      tolerant: true,
    },
    rules: {
      // Disable rules that flag Tailwind-specific at-rules
      "css/no-invalid-at-rules": "off",
    },
  },
  // JSON linting
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
  },
  // TypeScript recommended rules
  ...tseslint.configs.recommended,
  // React config
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { react },
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
    },
  },
  // Prettier - only for code files, not markdown
  {
    files: ["**/*.{js,jsx,ts,tsx,css,json}"],
    ...prettierRecommended,
    rules: {
      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],
    },
  },
];
