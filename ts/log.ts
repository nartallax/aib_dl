function twoDigits(n: number): string {
	return n > 9 ? n + "" : "0" + n
}
function threeDigits(n: number): string {
	return n > 99 ? n + "" : "0" + twoDigits(n)
}

export type DateFormat = (d: Date) => string
function dateFmt(inner: DateFormat): DateFormat {
	return d => (d && (d instanceof Date)) ? inner(d) : ""
}

export const localDate = dateFmt((d: Date) => d.getFullYear() + "." + twoDigits(d.getMonth() + 1) + "." + twoDigits(d.getDate()))
export const localTimeHours = dateFmt((d: Date) => twoDigits(d.getHours()))
export const localTimeMinutes = dateFmt((d: Date) => localTimeHours(d) + ":" + twoDigits(d.getMinutes()))
export const localTimeSeconds = dateFmt((d: Date) => localTimeMinutes(d) + ":" + twoDigits(d.getSeconds()))
export const localTimeMilliseconds = dateFmt((d: Date) => localTimeSeconds(d) + ":" + threeDigits(d.getMilliseconds()))

export const localTimeToHours = dateFmt((d: Date) => localDate(d) + " " + localTimeHours(d))
export const localTimeToMinutes = dateFmt((d: Date) => localDate(d) + " " + localTimeMinutes(d))
export const localTimeToSeconds = dateFmt((d: Date) => localDate(d) + " " + localTimeSeconds(d))
export const localTimeToMilliseconds = dateFmt((d: Date) => localDate(d) + " " + localTimeMilliseconds(d))

export function log(v: string) {
	let str = v + "\n"
	str = localTimeToMilliseconds(new Date()) + " | " + str
	process.stderr.write(str)
}