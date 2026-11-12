class PeekMeAudio extends AudioWorkletProcessor {
  constructor(){
    super();
    this.ring=new Int16Array(48000);this.readAt=0;this.writeAt=0;this.available=0;
    this.port.onmessage=event=>{
      const bytes=new Uint8Array(event.data);
      const pcm=new Int16Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/2));
      const count=pcm.length-pcm.length%2;
      for(let i=0;i<count;i+=2){
        if(this.available>=this.ring.length){this.readAt=(this.readAt+2)%this.ring.length;this.available-=2;}
        this.ring[this.writeAt]=pcm[i];this.ring[(this.writeAt+1)%this.ring.length]=pcm[i+1];
        this.writeAt=(this.writeAt+2)%this.ring.length;this.available+=2;
      }
    };
  }
  process(inputs,outputs){
    const [left,right]=outputs[0];
    for(let i=0;i<left.length;i++){
      if(this.available>=2){left[i]=this.ring[this.readAt]/32768;if(right)right[i]=this.ring[(this.readAt+1)%this.ring.length]/32768;this.readAt=(this.readAt+2)%this.ring.length;this.available-=2;}
      else{left[i]=0;if(right)right[i]=0;}
    }
    return true;
  }
}
registerProcessor('peekme-pcm',PeekMeAudio);
