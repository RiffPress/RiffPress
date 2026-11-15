# Deprecations

What Riff has deprecated, and what to use instead: the note `.github/SUPPORT.md` promises beside each deprecation. `node .github/scripts/public-promise.js` compares the public surface with the last release's, in the pre-commit hook and in CI, and fails when a public name goes or changes shape without a deprecation, and without a line here that names it in backticks.

A deprecated name keeps working, with a notice, until the next major version removes it. A hook is deprecated with `apply_filters_deprecated()` or `do_action_deprecated()`, a function with `_deprecated_function()`, a `window.riff` member or a custom property with a `@deprecated` tag in its docblock, and a route with `riff_deprecated` beside its endpoints, set to the version.

Add a line under the version that deprecates the name, in this form:

- `riff_old_filter`, since 7.1.0: use `riff_new_filter`, which is given the same arguments.

Nothing is deprecated yet.
