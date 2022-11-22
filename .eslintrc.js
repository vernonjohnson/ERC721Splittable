module.exports = {
  env: {
    browser: true,
    commonjs: true
  },
  extends: ['standard', 'plugin:mocha/recommended'],
  overrides: [
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
  },
  plugins: [
    'mocha'
  ]
}
