export class BetterSet<T> extends Set<T> {
    public isSuperset(set: Set<T>): boolean {
        for (const item of set) if (!this.has(item)) return false;
        return true;
    }

    public isSubset(set: Set<T>): boolean {
        for (const item of this) if (!set.has(item)) return false;
        return true;
    }

    public isSupersetProper(set: Set<T>): boolean {
        return this.isSuperset(set) && !this.isSubset(set);
    }

    public isSubsetProper(set: Set<T>): boolean {
        return this.isSubset(set) && !this.isSuperset(set);
    }

    public equals(set: Set<T>): boolean {
        return this.isSubset(set) && this.isSuperset(set);
    }

    public union(set: Set<T>): BetterSet<T> {
        const union = new BetterSet(this);
        for (const item of set) union.add(item);
        return union;
    }

    public intersection(set: Set<T>): BetterSet<T> {
        const intersection = new BetterSet<T>();
        for (const item of set) if (this.has(item)) intersection.add(item);
        return intersection;
    }

    public symmetricDifference(set: Set<T>): BetterSet<T> {
        const difference = new BetterSet<T>(this);
        for (const item of set)
            if (difference.has(item)) difference.delete(item);
            else difference.add(item);
        return difference;
    }

    public difference(set: Set<T>): BetterSet<T> {
        const difference = new BetterSet<T>(this);
        for (const item of set) difference.delete(item);
        return difference;
    }

    public update(set: Set<T>): this {
        for (const item of set) this.add(item);
        return this;
    }

    public differenceUpdate(set: Set<T>): this {
        for (const item of set) this.delete(item);
        return this;
    }

    public symmetricDifferenceUpdate(set: Set<T>): this {
        for (const item of set)
            if (this.has(item)) this.delete(item);
            else this.add(item);
        return this;
    }

    public intersectionUpdate(set: Set<T>): this {
        for (const item of this) if (!set.has(item)) this.delete(item);
        return this;
    }

    public sort(sorter?: (a: T, b: T) => number): BetterSet<T> {
        return new BetterSet([...this].sort(sorter));
    }

    public map<U>(
        mapper: (value: T, index: number, array: BetterSet<T>) => U
    ): BetterSet<U> {
        const result = new BetterSet<U>();
        let index = 0;
        for (const item of this) result.add(mapper(item, index++, this));
        return result;
    }

    public filter(
        predicate: (value: T, index: number, array: BetterSet<T>) => unknown
    ): BetterSet<T> {
        const result = new BetterSet<T>();
        let index = 0;
        for (const item of this)
            if (predicate(item, index++, this)) result.add(item);
        return result;
    }
}
