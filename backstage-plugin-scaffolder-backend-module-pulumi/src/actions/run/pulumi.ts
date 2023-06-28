import {createTemplateAction} from "@backstage/plugin-scaffolder-node";
import {RemoteWorkspace, fullyQualifiedStackName, LocalWorkspace} from "@pulumi/pulumi/automation";
import {InputError} from '@backstage/errors';

const {exec} = require('child_process');

export function createRunPulumiAction() {
    return createTemplateAction<{
        new: boolean
        up: boolean
        destroy: boolean
        deployment: boolean
        organization: string
        name: string
        description: string
        repoUrl: string
        repoBranch: string
        repoProjectPath: string
        template: string;
        stacks: string[];
        config: object;
        outputs: string[];
        args: string[];
    }>({
            id: 'pulumi:run',
            description: 'Runs Pulumi',
            schema: {
                input: {
                    type: 'object',
                    properties: {
                        new: {
                            title: 'Run Pulumi New',
                            description: 'This flag indicates that the Pulumi command "new" will be run',
                            type: 'boolean',
                        },
                        up: {
                            title: 'Run Pulumi Up',
                            description: 'This flag indicates that the Pulumi command "up" will be run',
                            type: 'boolean',
                        },
                        destroy: {
                            title: 'Run Pulumi Destroy',
                            description: 'This flag indicates that the Pulumi command "destroy" will be run',
                            type: 'boolean',
                        },
                        deployment: {
                            title: 'Use Pulumi Deployment',
                            description: 'This flag indicates that Pulumi Deployment will be used',
                            type: 'boolean',
                        },
                        template: {
                            title: 'Pulumi template',
                            description: 'The Pulumi template to use, this can be a built-in template or a URL to a template',
                            type: 'string',
                        },
                        stacks: {
                            title: 'Pulumi stacks',
                            description: 'The list of Pulumi stacks to use for the Pulumi commands',
                            type: 'array',
                        },
                        organization: {
                            title: 'Pulumi organization',
                            description: 'The Pulumi organization to use for the Pulumi commands',
                            type: 'string',
                        },
                        name: {
                            title: 'Pulumi project name',
                            description: 'The Pulumi project name to use',
                            type: 'string',
                        },
                        description: {
                            title: 'Pulumi project description',
                            description: 'The Pulumi project description to use',
                            type: 'string',
                        },
                        config: {
                            title: 'Pulumi project config',
                            description: 'The Pulumi project config to use',
                            type: 'object',
                        },
                        outputs: {
                            title: 'Pulumi project outputs',
                            description: 'The Pulumi project outputs to return',
                            type: 'array',
                        },
                        repoUrl: {
                            title: 'Pulumi project repo URL',
                            description: 'The Pulumi project repo URL to use, when using Pulumi Deployment',
                            type: 'string',
                        },
                        repoBranch: {
                            title: 'Pulumi project repo branch',
                            description: 'The Pulumi project repo branch to use, when using Pulumi Deployment',
                            type: 'string',
                        },
                        repoProjectPath: {
                            title: 'Pulumi project repo project path',
                            description: 'The Pulumi project repo project path to use, when using Pulumi Deployment',
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
                    `Running Pulumi`,
                );

                await process.chdir(ctx.workspacePath);
                ctx.logger.info('Working directory: ' + process.cwd());

                if (ctx.input.stacks.length == 0) {
                    throw new InputError('No Pulumi stacks specified, please specify at least one stack');
                }
                if (!ctx.input.organization) {
                    throw new InputError('No Pulumi organization specified, please specify an organization');
                }

                // currently automation api does not support pulumi new
                if (ctx.input.new) {
                    ctx.logger.info(`Running pulumi new...`);
                    const stackName = ctx.input.organization + '/' + ctx.input.stacks[0];
                    ctx.logger.info(`Creating stack ${stackName}...`)
                    await exec(`pulumi new ${ctx.input.template} ${ctx.input.args.join(' ')} --yes --force -n ${ctx.input.name} -d ${ctx.input.description} -s ${stackName}`, (error: {
                        message: any;
                    }, stdout: any, stderr: any) => {
                        if (error || stderr) {
                            throw new Error(error.message);
                        }
                        ctx.logger.info(`${stdout}`);
                    });
                } else {
                    if (!ctx.input.repoUrl) {
                        throw new InputError('No Pulumi project repo URL specified, please specify a repo URL');
                    }
                    ctx.logger.info(`repoUrl: ${ctx.input.repoUrl}`)
                    if (!ctx.input.repoProjectPath) {
                        throw new InputError('No Pulumi project repo project path specified, please specify a repo project path');
                    }
                    ctx.logger.info(`repoProjectPath: ${ctx.input.repoProjectPath}`)
                    if (!ctx.input.deployment) {
                        for (const stack of ctx.input.stacks) {
                            const stackName = fullyQualifiedStackName(ctx.input.organization, ctx.input.name, stack)
                            const s = await LocalWorkspace.createOrSelectStack({
                                stackName: stackName,
                                workDir: ctx.workspacePath + "/" + ctx.input.repoProjectPath,
                            })
                            for (const [key, value] of Object.entries(ctx.input.config)) {
                                await s.setConfig(key, {value: value})
                            }
                            ctx.logger.info(`Successfully initialized stack ${s.name}`)
                            ctx.logger.info(`Refreshing stack ${s.name}...`)
                            await s.refresh({onOutput: ctx.logger.info})
                            ctx.logger.info(`Successfully refreshed stack ${s.name}`)

                            if (ctx.input.destroy) {
                                ctx.logger.info(`Destroying stack ${s.name}...`)
                                await s.destroy({onOutput: ctx.logger.info})
                                ctx.logger.info(`Successfully destroyed stack ${s.name}`)
                            } else if (ctx.input.up) {
                                ctx.logger.info(`Updating stack ${s.name}...`)
                                const up = await s.up({onOutput: ctx.logger.info, showSecrets: true})
                                ctx.logger.info(`update summary: ${JSON.stringify(up.summary.resourceChanges, null, 4)}`)
                                for (const output of ctx.input.outputs) {
                                    ctx.output(output, up.outputs[output].value)
                                }
                            }
                        }
                    } else {
                        if (!ctx.input.repoBranch) {
                            throw new InputError('No Pulumi project repo branch specified, please specify a repo branch');
                        }
                        ctx.logger.info(`repoBranch: ${ctx.input.repoBranch}`)
                        const stack = ctx.input.stacks[0]
                        const stackName = fullyQualifiedStackName(ctx.input.organization, ctx.input.name, stack)
                        const remoteStack = await RemoteWorkspace.createOrSelectStack({
                            stackName: stackName,
                            url: ctx.input.repoUrl,
                            branch: "refs/heads/" + ctx.input.repoBranch,
                            projectPath: ctx.input.repoProjectPath,
                        })
                        ctx.logger.info(`Successfully initialized stack ${remoteStack.name}`)
                        ctx.logger.info(`Refreshing stack ${remoteStack.name}...`)
                        await remoteStack.refresh({onOutput: ctx.logger.info})
                        ctx.logger.info(`Successfully refreshed stack ${remoteStack.name}`)

                        if (ctx.input.destroy) {
                            ctx.logger.info(`Destroying stack ${remoteStack.name}...`)
                            await remoteStack.destroy({onOutput: ctx.logger.info})
                            ctx.logger.info(`Successfully destroyed stack ${remoteStack.name}`)
                        } else if (ctx.input.up) {
                            ctx.logger.info(`Updating stack ${remoteStack.name}...`)
                            const up = await remoteStack.up({onOutput: ctx.logger.info})
                            ctx.logger.info(`update summary: ${JSON.stringify(up.summary.resourceChanges, null, 4)}`)
                        }
                    }
                }
            }
        }
    )
}
