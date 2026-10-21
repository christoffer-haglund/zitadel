import { MessageInitShape } from '@bufbuild/protobuf';
import { inject, Injectable } from '@angular/core';
import {
  CreateAuthorizationRequestSchema,
  ListAuthorizationsRequestSchema,
} from '@zitadel/proto/zitadel/authorization/v2/authorization_service_pb';
import { GrpcService } from './grpc.service';

@Injectable({
  providedIn: 'root',
})
export class AuthorizationService {
  private readonly grpcService = inject(GrpcService);

  public createAuthorization(req: MessageInitShape<typeof CreateAuthorizationRequestSchema>) {
    return this.grpcService.authorization.createAuthorization(req);
  }

  public listAuthorizations(req: MessageInitShape<typeof ListAuthorizationsRequestSchema>) {
    return this.grpcService.authorization.listAuthorizations(req);
  }

  public deleteAuthorization(id: string) {
    return this.grpcService.authorization.deleteAuthorization({ id });
  }
}
