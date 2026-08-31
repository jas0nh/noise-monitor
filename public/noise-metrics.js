export function decibelAverage(values){const finite=values.filter(Number.isFinite);if(!finite.length)return null;return 10*Math.log10(finite.reduce((sum,value)=>sum+10**(value/10),0)/finite.length)}
export function isCalibrated(offset){return Number.isFinite(offset)&&Math.abs(offset)>.001}
export function displayLevel(sample,key){return sample[key]+sample.calibrationOffset}
