import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules', '**/build', '**/.svelte-kit'] },
  js.configs.recommended,
  tseslint.configs.strict,
);
