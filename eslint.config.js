import eslint from '@typescript-eslint/eslint-plugin'
import parser from '@typescript-eslint/parser'

export default [
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser,
            parserOptions: {
                projectService: true,
            },
        },
        plugins: {
            '@typescript-eslint': eslint,
        },
        rules: {
            '@typescript-eslint/consistent-type-assertions': [
                'error',
                { assertionStyle: 'never' },
            ],
        },
    },
]
