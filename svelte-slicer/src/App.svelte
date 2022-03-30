<script>
  import { CuraWASM } from "cura-wasm";
  import { resolveDefinition } from "cura-wasm-definitions";
  import BlockToolbar from "./BlockToolbar.svelte";
  import { Button, MaterialApp } from "svelte-materialify";
  import { themeStore } from "./store";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  const progress = tweened(0, {
    duration: 400,
    easing: cubicOut,
  });

  let percent = 0;

  progress.subscribe((value) => (percent = value));

  export let name;

  let metadata_display;
  let global_gcode;

  async function handleFinish() {
    //Create the download link and download the file
    const blob = new Blob([global_gcode], {
      type: "text/plain",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Output.gcode";
    link.click();
    link.remove();
  }

  async function slice() {
    //Create a new slicer
    const slicer = new CuraWASM({
      command:
        "slice -j definitions/printer.def.json -o Model.gcode -s layer_height=0.06 -l Model.stl",
      definition: resolveDefinition("ultimaker2"),
      transfer: true,
      verbose: true,
    });

    //Load your STL as an ArrayBuffer
    const res = await fetch("assets/benchy.stl");
    const stl = await res.arrayBuffer();

    //Progress logger (Ranges from 0 to 100)
    slicer.on("progress", (percent) => {
      progress.set(percent / 100);
    });

    //Slice (This can take multiple minutes to resolve!)
    const { gcode, metadata } = await slicer.slice(stl, "stl");
    metadata_display = metadata;
    global_gcode = gcode;

    //Do something with the GCODE (ArrayBuffer) and metadata (Object)
    console.log(String.fromCharCode.apply(null, new Uint16Array(gcode)));
  }
</script>

<MaterialApp theme={$themeStore}>
  <BlockToolbar />
  <h1>Hello {name}!</h1>
  <Button type="button" on:click={slice}>Generate G-code</Button>

  {#if percent > 0}
    <p>{Math.trunc(percent * 100)} %</p>
    <progress value={$progress} />
  {/if}

  {#if metadata_display !== undefined}
    {#each Object.entries(metadata_display) as [key, value]}
      <p>
        {key} : {value}
      </p>
    {/each}
    <Button type="button" on:click={handleFinish}>Download Gcode</Button>
  {/if}
</MaterialApp>

<style>
  h1 {
    color: #ff3e00;
    text-transform: uppercase;
    font-size: 4em;
    font-weight: 100;
  }

  progress {
    display: block;
    width: 50%;
  }
</style>
