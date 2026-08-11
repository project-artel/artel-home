import { registerHooks } from 'node:module'

/*
 * Lets `node --test` run the project's TypeScript modules directly.
 *
 * There is no test runner in `devDependencies` and none is being added, so the
 * tests run on Node's built-in one, which executes `.ts` by stripping types.
 * Two things about a Vite-authored source tree stop that on its own, and this
 * file is the whole of the bridge:
 *
 *   1. Vite resolves `./foo` to `./foo.ts`; Node's ESM resolver does not, and
 *      rewriting every application import to carry an extension would be a
 *      change to shipped code made purely for the tests.
 *   2. `import.meta.env` is Vite's, not Node's. A module that reads it — the
 *      orchestration base URL in `src/auth/authApi.ts` — throws on import under
 *      Node, which takes down anything that transitively imports it, including
 *      the response parsers these tests exist to cover.
 *
 * Test tooling only. Nothing here is loaded by the application or by the build,
 * and the values below are never the ones the browser sees.
 */

/** Extensions to try, in order, for a relative specifier that has none. */
const EXTENSIONS = ['.ts', '.tsx']

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const extension of EXTENSIONS) {
        try {
          return nextResolve(`${specifier}${extension}`, context)
        } catch {
          // Try the next one; the bare specifier is the last resort below.
        }
      }
    }
    return nextResolve(specifier, context)
  },

  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context)
    if (!url.endsWith('.ts') || loaded.source === undefined || loaded.source === null) {
      return loaded
    }

    const source = loaded.source.toString()
    if (!source.includes('import.meta.env')) return loaded

    // Substitution rather than a global: `import.meta` belongs to the module and
    // cannot be populated from outside it.
    return {
      ...loaded,
      source: source.replaceAll('import.meta.env', 'globalThis.__VITE_TEST_ENV__'),
    }
  },
})

// Empty on purpose. Every consumer already has a fallback for an unset variable,
// and a test that depended on one of these values would be asserting the
// environment instead of the code.
globalThis.__VITE_TEST_ENV__ = {}
