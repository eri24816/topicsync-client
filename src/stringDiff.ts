declare global {
    interface Number {
        isValidPositionIn(str: string): boolean
    }
    interface String {
        before(index: number): string
        after(index: number): string
    }
}
Number.prototype.isValidPositionIn = function (str: string): boolean {
    return 0 <= this && this <= str.length
}
String.prototype.before = function (index: number): string {
    return this.slice(0, index)
}
String.prototype.after = function (index: number): string {
    return this.slice(index)
}

export function insert(old: string, position: number, insertion: string): string {
    if (!position.isValidPositionIn(old)) {
        throw new RangeError(`Insertion invalid: invalid position ${position}. Insert position must between [0, old.length]`)
    }

    return `${old.before(position)}${insertion}${old.after(position)}`
}

export function del(old: string, position: number, deletion: string): string {
    if (!position.isValidPositionIn(old)) {
        throw new RangeError(`Deletion invalid: invalid position ${position}. Delete position must between [0, len(old)]`)
    }

    if (!old.slice(position).startsWith(deletion)) {
        throw new Error(`Deletion invalid: string '${deletion}' doesn't appear at position ${position} of string '${old}'`)
    }

    return `${old.before(position)}${old.after(position + deletion.length)}`
}