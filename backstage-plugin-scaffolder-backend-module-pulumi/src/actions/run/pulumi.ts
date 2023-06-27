import {createTemplateAction} from "@backstage/plugin-scaffolder-node";

const {exec} = require('child_process');

export function createRunPulumiAction() {
    return createTemplateAction<{
        command: string;
        args: string[];
    }>({
        id: 'run:pulumi',
        description: 'Runs Pulumi',
        schema: {
            input: {
                type: 'object',
                required: ['command'],
                properties: {
                    command: {
                        title: 'Pulumi command',
                        description: 'The Pulumi command to run',
                        type: 'string',
                    },
                    args: {
                        title: 'Pulumi command arguments',
                        description: 'The Pulumi command arguments to run',
                        type: 'array',
                        items: {
                            type: 'string',
                        }
                    },
                },
            },
        },
        async handler(ctx) {
            ctx.logger.info(
                `Running Pulumi command: ${ctx.input.command} ${ctx.input.args.join(' ')}`,
            );
            
            await process.chdir(ctx.workspacePath);
            ctx.logger.info('New directory: ' + process.cwd());

            await exec(`pulumi ${ctx.input.command} ${ctx.input.args.join(' ')}`, (error: {
                message: any;
            }, stdout: any, stderr: any) => {
                if (error) {
                    ctx.logger.error(`error: ${error.message}`);
                }
                if (stderr) {
                    ctx.logger.error(`stderr: ${stderr}`);
                }
                ctx.logger.info(`stdout: ${stdout}`);
            });
        },
    })
}
