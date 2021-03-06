import { Command, CommandWrapper, GroupMap } from './interfaces';
import { join } from 'path';

/**
 * Function to create a loader instance, this allows the config to be injected
 * @param: searchPrefix A string that tells the command loader how cli commands will be named, ie.
 * 	'@dojo/cli-' is the default meaning commands could be
 * 		- '@dojo/cli-build-webpack'
 * 		- '@dojo/cli-serve-dist'
 */
export function initCommandLoader(searchPrefixes: string[]): (path: string) => CommandWrapper {
	const commandRegExp = new RegExp(`(?:${searchPrefixes.join('|').replace('/', '\\/')})-([^-]+)-(.+)$`);

	return function load(path: string): CommandWrapper {
		// Using yargs argv causes issues with running commands if used here
		const isHelpCall =
			process.argv.length === 2 ||
			(process.argv.length === 3 && (process.argv[2] === '-h' || process.argv[2] === '--help'));

		let nodeModule: any;

		if (isHelpCall) {
			// Avoid loading all modules on a call to help
			const packageJson = require(join(path, 'package.json'));
			nodeModule = {
				description: packageJson.description,
				register: () => {},
				run: () => {},
				alias: [],
				eject: () => {},
				global: false,
				validate: () => {}
			};
		} else {
			nodeModule = require(path);
		}

		try {
			const command = convertModuleToCommand(nodeModule);
			const { description, register, run, alias, eject, global = false, validate } = command;
			//  derive the group and name from the module directory name, e.g. dojo-cli-group-name
			const [, group, name] = <string[]>commandRegExp.exec(path);

			return {
				name,
				group,
				alias,
				description,
				register,
				installed: true,
				global: group === 'create' && name === 'app' ? true : global,
				run,
				path,
				eject,
				validate
			};
		} catch (err) {
			throw new Error(`Path: ${path} returned module that does not satisfy the Command interface. ${err}`);
		}
	};
}

/**
 * Creates a builtIn command loader function.
 */
export function createBuiltInCommandLoader(): (path: string) => CommandWrapper {
	return function load(path: string): CommandWrapper {
		const module = require(path);

		try {
			const command = convertModuleToCommand(module);
			//  derive the name and group of the built in commands from the command itself (these are optional props)
			const { name = '', group = '', alias, description, register, run, global = false } = command;

			return {
				name,
				group,
				alias,
				global,
				installed: true,
				description,
				register,
				run,
				path
			};
		} catch (err) {
			throw new Error(`Path: ${path} returned module that does not satisfy the Command interface: ${err}`);
		}
	};
}

export function convertModuleToCommand(module: any): Command {
	if (module.__esModule && module.default) {
		module = module.default;
	}

	if (module.description && module.register && module.run) {
		return module;
	} else {
		throw new Error(`Module does not satisfy the Command interface`);
	}
}

export function getCommand(groupMap: GroupMap, groupName: string, commandName?: string): CommandWrapper {
	const commandMap = groupMap.get(groupName);
	if (!commandMap) {
		throw new Error(`Unable to find command group: ${groupName}`);
	}
	if (commandName) {
		const command = commandMap.get(commandName);
		if (!command) {
			throw new Error(`Unable to find command: ${commandName} for group: ${groupName}`);
		}
		return command;
	}
	return [...commandMap.values()].find((wrapper) => {
		return !!wrapper.default;
	})!;
}
