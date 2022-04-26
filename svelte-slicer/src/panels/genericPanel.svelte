<script>
  import { Card, CardActions, Button } from "svelte-materialify";
  import { slicerConfigStore } from "../stores/panelStore.svelte";

  function changeTheme() {
    themeStore.update((theme) => (theme === "light" ? "dark" : "light"));
  }

  export let inputs = [[]];
  export let panelTitle = "";
  let currentIndex = 0;

  // input variables
  let textInput = {};
  let rangeValue = {};

  function updateSlicer(key, value) {
    $slicerConfigStore.set(key.toLowerCase(), value);
  }
</script>

<div class="panel">
  <Card outlined style="max-width:300px;">
    <div class="pl-4 pr-4 pt-3">
      <span class="text-overline"> {panelTitle} </span>
      <br />
      <span> x: {$slicerConfigStore.get('x')} </span>
      <span> y: {$slicerConfigStore.get('y')} </span>
      <span> z: {$slicerConfigStore.get('z')} </span>
    </div>
    <div class="inputs">
      {#each inputs[currentIndex] as input}
        {#if input.type === "checkbox"}
          <input type="checkbox" name={input.name} />
        {:else if input.type === "text"}
          <p>{input.name}</p>
          <input
            type="text"
            name={input.name}
            bind:value={textInput[input.name]}
            on:input={() => updateSlicer(input.name, textInput[input.name])}
          />
        {:else if input.type === "range"}
          <p>{input.name}</p>
          <input
            type="range"
            name={input.name}
            min={input.min}
            max={input.max}
            bind:value={rangeValue[input.name]}
            on:input={() => updateSlicer(input.name, rangeValue[input.name])}
          />
        {:else if input.type === "submenu"}
          <br />
          <button on:click={() => (currentIndex = input.index)}>
            {input.name}
          </button>
        {/if}
      {/each}
    </div>
    <CardActions>
      <Button rounded outlined on:click={changeTheme}>Switch theme</Button>
    </CardActions>
  </Card>
</div>
