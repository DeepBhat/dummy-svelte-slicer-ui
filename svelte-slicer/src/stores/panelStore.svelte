<script context="module">
  import { writable, derived, get } from "svelte/store";

  function createMapStore(initial) {
    const store = writable(initial);
    const set = (key, value) =>
      store.update((m) => Object.assign({}, m, { [key]: value }));
    const results = derived(store, (s) => ({
      keys: Object.keys(s),
      values: Object.values(s),
      entries: Object.entries(s),
      set(k, v) {
        store.update((s) => Object.assign({}, s, { [k]: v }));
      },
      get(k) {
        return get(store)[k];
      },
      remove(k) {
        store.update((s) => {
          delete s[k];
          return s;
        });
      },
    }));
    return {
      get: results.get,
      subscribe: results.subscribe,
      set: store.set,
    };
  }

  export const slicerConfigStore = createMapStore({
    x: 0,
    y: 0,
    z: 0,
  });
</script>
