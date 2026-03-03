import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpsertBlogPostDto {
  @IsString()
  @MinLength(6)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(400)
  summary!: string;

  @IsString()
  @MinLength(30)
  content!: string;

  @IsString()
  @MaxLength(120)
  authorName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @IsUrl()
  resourceUrl?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(["draft", "published"])
  status?: "draft" | "published";
}
