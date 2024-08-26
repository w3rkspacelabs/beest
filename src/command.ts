export interface Command{
    command: string;
    describe: string;
    interactiveMode: boolean;
    // aliases: string[];
    handler(args: any): Promise<void>;
}
