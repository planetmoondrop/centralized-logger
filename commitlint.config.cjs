module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'release',
        'build',
        'ci',
        'chore',
        'revert',
        'publish',
      ],
    ],
  },
};
