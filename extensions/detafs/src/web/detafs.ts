import * as path from "path";
import * as vscode from "vscode";
import { Deta } from "deta";

export class File implements vscode.FileStat {
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;

  name: string;
  data?: Uint8Array;

  constructor(uri: vscode.Uri, name: string) {
    this.type = vscode.FileType.File;
    this.ctime = Date.now(); // TODO: Get from Base
    this.mtime = Date.now(); // TODO: Get from Base
    this.size = 0;
    this.name = name;
  }
}

export class Directory implements vscode.FileStat {
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;

  name: string;
  entries: Map<string, File | Directory>;

  constructor(name: string) {
    this.type = vscode.FileType.Directory;
    this.ctime = Date.now(); // TODO: Get from Base
    this.mtime = Date.now(); // TODO: Get from Base
    this.size = 0;
    this.name = name;
    this.entries = new Map();
  }
}

export type Entry = File | Directory;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class DetaFS implements vscode.FileSystemProvider {
  root = new Directory("");
  deta = Deta(vscode.workspace.getConfiguration("detafs").get("detaKey"));
  drive = this.deta.Drive("files");

  async init() {
    const { names } = await this.drive.list();

    names.map(async (name) => {
      const content = await this.drive.get(name);

      if (content) {
        const buffer = await content.arrayBuffer();

        vscode.workspace.fs.writeFile(
          vscode.Uri.parse(`detafs:/${name}`),
          new Uint8Array(buffer),
        );
      }
    });
  }

  // --- manage file metadata

  stat(uri: vscode.Uri): vscode.FileStat {
    return this._lookup(uri, false);
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const entry = this._lookupAsDirectory(uri, false);
    const result: [string, vscode.FileType][] = [];
    for (const [name, child] of entry.entries) {
      result.push([name, child.type]);
    }
    return result;
  }

  // --- manage file contents

  readFile(uri: vscode.Uri): Uint8Array {
    const data = this._lookupAsFile(uri, false).data;
    if (data) {
      return data;
    }
    throw vscode.FileSystemError.FileNotFound();
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create?: boolean; overwrite?: boolean },
  ): Promise<void> {
    let basename = path.posix.basename(uri.path);
    let parent = this._lookupParentDirectory(uri);
    let entry = parent.entries.get(basename);

    if (entry instanceof Directory) {
      throw vscode.FileSystemError.FileIsADirectory(uri);
    }
    if (!entry && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (entry && options.create && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }
    if (!entry) {
      entry = new File(uri, basename);
      parent.entries.set(basename, entry);
      this._fireSoon({ type: vscode.FileChangeType.Created, uri });
    }

    entry.mtime = Date.now();
    entry.size = content.byteLength;
    entry.data = content;

    const filePath = uri.path.split("/").slice(1).join("/");

    this.drive.put(filePath, {
      data: textDecoder.decode(entry.data),
    });

    this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
  }

  // --- manage files/folders
  // Renaming files is not possible according to Deta discord
  // TODO: Figure out how to do this

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): Promise<void> {
    if (!options.overwrite && this._lookup(newUri, true)) {
      throw vscode.FileSystemError.FileExists(newUri);
    }

    const entry = this._lookup(oldUri, false);
    const oldParent = this._lookupParentDirectory(oldUri);

    const newParent = this._lookupParentDirectory(newUri);
    const newName = path.posix.basename(newUri.path);

    oldParent.entries.delete(entry.name);
    entry.name = newName;
    newParent.entries.set(newName, entry);

    const oldPath = oldUri.path.split("/").slice(1).join("/");
    const newPath = newUri.path.split("/").slice(1).join("/");

    const { names } = await this.drive.list({ prefix: oldPath });

    names.map(async (name: string) => {
      const content = await this.drive.get(name);

      if (content) {
        const buffer = await content.arrayBuffer();

        this.drive.delete(oldPath);
        // This doesn't work properly
        this.drive.put(newPath, { data: new Uint8Array(buffer) });
      }
    });

    this._fireSoon(
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    );
  }

  async delete(uri: vscode.Uri): Promise<void> {
    const dirname = uri.with({ path: path.posix.dirname(uri.path) });
    const basename = path.posix.basename(uri.path);
    const parent = this._lookupAsDirectory(dirname, false);

    if (!parent.entries.has(basename)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    parent.entries.delete(basename);
    parent.mtime = Date.now();
    parent.size -= 1;

    const filePath = uri.path.split("/").slice(1).join("/");

    const { names } = await this.drive.list({ prefix: filePath });
    this.drive.deleteMany(names);

    this._fireSoon(
      { type: vscode.FileChangeType.Changed, uri: dirname },
      {
        uri,
        type: vscode.FileChangeType.Deleted,
      },
    );
  }

  createDirectory(uri: vscode.Uri): void {
    const basename = path.posix.basename(uri.path);
    const dirname = uri.with({ path: path.posix.dirname(uri.path) });
    const parent = this._lookupAsDirectory(dirname, false);

    const entry = new Directory(basename);
    parent.entries.set(entry.name, entry);
    parent.mtime = Date.now();
    parent.size += 1;

    this._fireSoon(
      { type: vscode.FileChangeType.Changed, uri: dirname },
      {
        type: vscode.FileChangeType.Created,
        uri,
      },
    );
  }

  // --- lookup

  private _lookup(uri: vscode.Uri, silent: false): Entry;
  private _lookup(uri: vscode.Uri, silent: boolean): Entry | undefined;
  private _lookup(uri: vscode.Uri, silent: boolean): Entry | undefined {
    const parts = uri.path.split("/");
    let entry: Entry = this.root;
    for (const part of parts) {
      if (!part) {
        continue;
      }
      let child: Entry | undefined;
      if (entry instanceof Directory) {
        child = entry.entries.get(part);
      }
      if (!child) {
        if (!silent) {
          throw vscode.FileSystemError.FileNotFound(uri);
        } else {
          return undefined;
        }
      }
      entry = child;
    }
    return entry;
  }

  private _lookupAsDirectory(uri: vscode.Uri, silent: boolean): Directory {
    const entry = this._lookup(uri, silent);
    if (entry instanceof Directory) {
      return entry;
    }
    throw vscode.FileSystemError.FileNotADirectory(uri);
  }

  private _lookupAsFile(uri: vscode.Uri, silent: boolean): File {
    const entry = this._lookup(uri, silent);
    if (entry instanceof File) {
      return entry;
    }
    throw vscode.FileSystemError.FileIsADirectory(uri);
  }

  private _lookupParentDirectory(uri: vscode.Uri): Directory {
    const dirname = uri.with({ path: path.posix.dirname(uri.path) });
    return this._lookupAsDirectory(dirname, false);
  }

  // --- manage file events

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  private _bufferedEvents: vscode.FileChangeEvent[] = [];
  private _fireSoonHandle?: NodeJS.Timer;

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._emitter.event;

  watch(_resource: vscode.Uri): vscode.Disposable {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => {});
  }

  private _fireSoon(...events: vscode.FileChangeEvent[]): void {
    this._bufferedEvents.push(...events);

    if (this._fireSoonHandle) {
      clearTimeout(this._fireSoonHandle);
    }

    this._fireSoonHandle = setTimeout(() => {
      this._emitter.fire(this._bufferedEvents);
      this._bufferedEvents.length = 0;
    }, 5);
  }
}
