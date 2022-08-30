/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as ts from 'typescript';
import { ApiClient, APIRequests } from '@vscode/sync-api-client';
import { ClientConnection, DTOs } from '@vscode/sync-api-common/browser';
import { Utils } from 'vscode-uri';


let host: ts.ParseConfigFileHost | undefined
let host2: ts.CompilerHost | undefined // ProgramHost, System, WatchCompilerHost[OfFileAndCompilerOptions], LanguageServiceHost
let lsh: ts.LanguageServiceHost | undefined
let init: Promise<any> | undefined
self.onmessage = async event => {
    const { data } = event;
    // when receiving a message port use it to create the sync-rpc
    // connection. continue to listen to "normal" message events
    // for commands or other things
    if (data instanceof MessagePort) {
        const connection = new ClientConnection<APIRequests>(data);
        init = connection.serviceReady().then(() => initTsConfigHost(connection))
        return;
    }
    if (!init) {
        console.error('INIT message not yet received');
        return;
    }
    await init
    // every other message is a parse-ts-config-request
    if (!host) {
        console.error('NOT READY', data);
        return
    }
    if (typeof data !== 'string') {
        console.error('UNKNOWN DATA', data);
        return;
    }
    try {
        const parsed = ts.getParsedCommandLineOfConfigFile(data, undefined, host)
        console.log(JSON.stringify(parsed, undefined, 4))
    } catch (error) {
        console.error(error)
    }
}


function initTsConfigHost(connection: ClientConnection<APIRequests>) {
	const apiClient = new ApiClient(connection);
    type FileSystemEntries = {
        readonly files: readonly string[];
        readonly directories: readonly string[];
    }
    type TSExt = typeof ts & {
        matchFiles(
            path: string,
            extensions: readonly string[] | undefined,
            excludes: readonly string[] | undefined,
            includes: readonly string[] | undefined,
            useCaseSensitiveFileNames: boolean,
            currentDirectory: string, depth: number | undefined,
            getFileSystemEntries: (path: string) => FileSystemEntries,
            realpath: (path: string) => string
        ): string[];
    }
    function getFileSystemEntries(path: string): FileSystemEntries {
            const uri = Utils.joinPath(apiClient.vscode.workspace.workspaceFolders[0].uri, path)
            const entries = apiClient.vscode.workspace.fileSystem.readDirectory(uri);
            const files: string[] = [];
            const directories: string[] = [];
            for (const [name, type] of entries) {
                switch (type) {
                    case DTOs.FileType.Directory:
                        directories.push(name);
                        break;
                    case DTOs.FileType.File:
                        files.push(name);
                        break;
                }
            }
            return { files, directories }
        }
    host = {
        // -- ParseConfigFileHost
        useCaseSensitiveFileNames: true,
        getCurrentDirectory: () => '/',
        readDirectory(rootDir, extensions, excludes, includes, depth?): readonly string[] {
            return (<TSExt>ts).matchFiles(
                rootDir, extensions, excludes, includes, false, this.getCurrentDirectory(), depth,
                getFileSystemEntries,
                path => path
            )
        },
        fileExists(path) {
            try {
                const uri = Utils.joinPath(apiClient.vscode.workspace.workspaceFolders[0].uri, path)
                apiClient.vscode.workspace.fileSystem.stat(uri)
                return true;
            } catch (error) {
                return false;
            }
        },
        readFile(path) {
            const uri = Utils.joinPath(apiClient.vscode.workspace.workspaceFolders[0].uri, path)
            const bytes = apiClient.vscode.workspace.fileSystem.readFile(uri)
            return new TextDecoder().decode(new Uint8Array(bytes).slice())
        },
        // --- ConfigFileDiagnosticsReporter
        onUnRecoverableConfigFileDiagnostic(d) {
            debugger;
            console.error('FATAL', d)
        },
    }
    host2 = {
        // ...host,
        getSourceFile(fileName: string, languageVersionOrOptions: ScriptTarget | CreateSourceFileOptions, onError?: (message: string) => void, shouldCreateNewSourceFile?: boolean): SourceFile | undefined {
        },
        getSourceFileByPath?(fileName: string, path: Path, languageVersionOrOptions: ScriptTarget | CreateSourceFileOptions, onError?: (message: string) => void, shouldCreateNewSourceFile?: boolean): SourceFile | undefined {
        },
        getCancellationToken?(): CancellationToken {
        },
        getDefaultLibFileName(options: CompilerOptions): string {
        },
        getDefaultLibLocation?(): string {
        },
        writeFile: WriteFileCallback,
        getCurrentDirectory(): string {
        }
        getCanonicalFileName(fileName: string): string {
        },
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        readDirectory?(rootDir: string, extensions: readonly string[], excludes: readonly string[] | undefined, includes: readonly string[], depth?: number): string[] {
        },
        resolveModuleNames?(moduleNames: string[], containingFile: string, reusedNames: string[] | undefined, redirectedReference: ResolvedProjectReference | undefined, options: CompilerOptions, containingSourceFile?: SourceFile): (ResolvedModule | undefined)[] {
        },
        /**
         * Returns the module resolution cache used by a provided `resolveModuleNames` implementation so that any non-name module resolution operations (eg, package.json lookup) can reuse it
         */
        getModuleResolutionCache?(): ModuleResolutionCache | undefined {
        },
        /**
         * This method is a companion for 'resolveModuleNames' and is used to resolve 'types' references to actual type declaration files
         */
        resolveTypeReferenceDirectives?(typeReferenceDirectiveNames: string[] | readonly FileReference[], containingFile: string, redirectedReference: ResolvedProjectReference | undefined, options: CompilerOptions, containingFileMode?: SourceFile["impliedNodeFormat"] | undefined): (ResolvedTypeReferenceDirective | undefined)[] {
        },
        getEnvironmentVariable?(name: string): string | undefined {
        },
        createHash?(data: string): string {
        },
        getParsedCommandLine?(fileName: string): ParsedCommandLine | undefined {
        }
    }
    let scriptVersion = new Map<string, number>()
    let projectVersion = 0
    lsh = {
        getCompilationSettings(): ts.CompilerOptions {
            // TODO: read settings from a tsconfig at root?
            return {
                strict: true
            }
        },
        getNewLine: () => '\n',
        getProjectVersion: () => projectVersion + ''
        getScriptFileNames(): string[]{},
        getScriptKind?(fileName: string): ScriptKind {},
        getScriptVersion(fileName) {
            // TODO: Might return undefined?!
            return scriptVersion.get(fileName) + ''
        },
        getScriptSnapshot(fileName: string): IScriptSnapshot | undefined{},
        getProjectReferences?(): readonly ProjectReference[] | undefined{},
        getLocalizedDiagnosticMessages?(): any{},
        getCancellationToken?(): HostCancellationToken{},
        getCurrentDirectory(): string{},
        getDefaultLibFileName(options: CompilerOptions): string{},
        log?(s: string): void{},
        trace?(s: string): void{},
        error?(s: string): void{},
        useCaseSensitiveFileNames?(): boolean{},
        readDirectory?(path: string, extensions?: readonly string[], exclude?: readonly string[], include?: readonly string[], depth?: number): string[]{},
        realpath?(path: string): string{},
        readFile(path: string, encoding?: string): string | undefined{},
        fileExists(path: string): boolean{},
        getTypeRootsVersion?(): number{},
        resolveModuleNames?(moduleNames: string[], containingFile: string, reusedNames: string[] | undefined, redirectedReference: ResolvedProjectReference | undefined, options: CompilerOptions, containingSourceFile?: SourceFile): (ResolvedModule | undefined)[]{},
        getResolvedModuleWithFailedLookupLocationsFromCache?(modulename: string, containingFile: string, resolutionMode?: ModuleKind.CommonJS | ModuleKind.ESNext): ResolvedModuleWithFailedLookupLocations | undefined{},
        resolveTypeReferenceDirectives?(typeDirectiveNames: string[] | FileReference[], containingFile: string, redirectedReference: ResolvedProjectReference | undefined, options: CompilerOptions, containingFileMode?: SourceFile["impliedNodeFormat"] | undefined): (ResolvedTypeReferenceDirective | undefined)[]{},
        getDirectories?(directoryName: string): string[]{},
        /**
         * Gets a set of custom transformers to use during emit.
         */
        getCustomTransformers?(): CustomTransformers | undefined{},
        isKnownTypesPackageName?(name: string): boolean{},
        installPackage?(options: InstallPackageOptions): Promise<ApplyCodeActionCommandResult>{},
        writeFile?(fileName: string, content: string): void{},
        getParsedCommandLine?(fileName: string): ParsedCommandLine | undefined{},
        // GetEffectiveTypeRootsHost
        directoryExists?(directoryName: string): boolean {},
        // MinimalResolutionCacheHost
        getCompilerHost: () => host2, // !
    }
}
