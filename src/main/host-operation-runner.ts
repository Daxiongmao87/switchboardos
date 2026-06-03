import type { HostOperationInput, HostOperationResult } from '../shared/mvp-models';
import type { SshService } from './ssh-service';

export class HostOperationRunner {
  constructor(private readonly sshService: SshService) {}

  run(input: HostOperationInput): Promise<HostOperationResult> {
    return this.sshService.runHostOperation(input);
  }
}
