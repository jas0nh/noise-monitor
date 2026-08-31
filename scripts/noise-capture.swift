import AVFoundation
import Foundation

let seconds = Double(CommandLine.arguments.dropFirst().first ?? "60") ?? 60
guard seconds > 0, seconds <= 600 else { fputs("invalid_duration\n", stderr); exit(2) }
let engine = AVAudioEngine()
let input = engine.inputNode
let format = input.inputFormat(forBus: 0)
guard format.sampleRate > 0, format.channelCount > 0 else { fputs("no_microphone_input\n", stderr); exit(2) }
var sum=0.0, peak=0.0, floorDb=Double.infinity, windowSum=0.0
var count:Int64=0, windowCount:Int64=0
let windowFrames=Int64(format.sampleRate), lock=NSLock()
input.installTap(onBus:0,bufferSize:4096,format:format){buffer,_ in
  guard let data=buffer.floatChannelData?[0] else{return}; lock.lock(); defer{lock.unlock()}
  for index in 0..<Int(buffer.frameLength){let value=Double(data[index]),energy=value*value;sum+=energy;windowSum+=energy;peak=max(peak,abs(value));count+=1;windowCount+=1;if windowCount>=windowFrames{floorDb=min(floorDb,20*log10(max(sqrt(windowSum/Double(windowCount)),0.000001)));windowSum=0;windowCount=0}}
}
do{try engine.start()}catch{fputs("capture_error\n",stderr);exit(1)}
Thread.sleep(forTimeInterval:seconds);engine.stop();input.removeTap(onBus:0);lock.lock()
if windowCount>0{floorDb=min(floorDb,20*log10(max(sqrt(windowSum/Double(windowCount)),0.000001)))}
let rms=count>0 ? sqrt(sum/Double(count)):0,laeq=20*log10(max(rms,0.000001)),peakDb=20*log10(max(peak,0.000001)),floor=floorDb.isFinite ? min(floorDb,laeq):laeq;lock.unlock()
print(String(format:"{\"durationSeconds\":%.1f,\"laeq\":%.2f,\"peak\":%.2f,\"floor\":%.2f}",seconds,laeq,max(peakDb,laeq),floor))
